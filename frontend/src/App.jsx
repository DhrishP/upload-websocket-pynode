import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

function App() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [fileId, setFileId] = useState(null);
  const ws = useRef(null);
  const retryCount = useRef(0);
  const maxRetries = 5;
  const retryDelay = 3000;
  const chunkSize = 64 * 1024;
  const fileRef = useRef(null);

  useEffect(() => {
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    fileRef.current = selectedFile;
    setProgress(0);
    setSpeed(0);
    setEta(null);
    setError(null);
    setFileId(generateFileId(selectedFile));
  };

  const generateFileId = (file) => {
    return `${file.name}-${file.size}-${new Date().getTime()}`;
  };

  const connectWebSocket = () => {
    ws.current = new WebSocket("ws://localhost:3001/ws");

    ws.current.onopen = () => {
      console.log("WebSocket connection established");
      retryCount.current = 0;
      startUpload();
    };

    ws.current.onmessage = handleWebSocketMessage;

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setError("Connection error. Retrying...");
      retryConnection();
    };

    ws.current.onclose = () => {
      console.log("WebSocket connection closed");
      if (uploading) {
        setError("Connection closed. Retrying...");
        retryConnection();
      }
    };
  };

  const retryConnection = () => {
    if (retryCount.current < maxRetries) {
      retryCount.current += 1;
      setTimeout(connectWebSocket, retryDelay);
    } else {
      setError("Max retries reached. Please try again later.");
      setUploading(false);
    }
  };

  const handleWebSocketMessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "progress") {
      setProgress(message.progress);
      setSpeed(message.speed);
      setEta(message.eta);
    } else if (message.type === "complete") {
      console.log(message.message);
      setUploading(false);
      setProgress(100);
      setEta(0);
      ws.current.close();
    } else if (message.type === "error") {
      setError(message.message);
      setUploading(false);
      ws.current.close();
    } else if (message.type === "resume") {
      resumeUpload(message.bytesReceived);
    }
  };

  const startUpload = () => {
    ws.current.send(
      JSON.stringify({
        type: "start",
        fileName: file.name,
        fileSize: file.size,
        fileId: fileId,
      })
    );
  };

  const resumeUpload = (bytesReceived) => {
    let offset = bytesReceived;

    const readNextChunk = (chunkOffset) => {
      const slice = fileRef.current.slice(
        chunkOffset,
        chunkOffset + parseInt(chunkSize)
      );
      const reader = new FileReader();

      reader.onload = (e) => {
        const chunk = e.target.result;
        ws.current.send(chunk);

        offset += chunk.byteLength;
        if (offset < fileRef.current.size) {
          readNextChunk(offset);
        } else {
          console.log("Sending end signal");
          ws.current.send(JSON.stringify({ type: "end", fileId: fileId }));
        }
      };

      reader.readAsArrayBuffer(slice);
    };

    readNextChunk(offset);
  };

  const uploadFile = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const response = await axios.get(
        `http://localhost:3001/upload-status/${fileId}`
      );
      if (response.data.bytesReceived) {
        setProgress((response.data.bytesReceived / file.size) * 100);
      }
    } catch (error) {
      console.error("Error checking upload status:", error);
    }

    connectWebSocket();
  };

  const formatEta = (seconds) => {
    if (seconds === Infinity || isNaN(seconds)) return "Calculating...";
    if (seconds === 0) return "Complete";
    
    if (seconds < 60) return "< 1 minute";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    let result = "";
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0 || hours > 0) result += `${minutes}m`;

    return result.trim();
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} disabled={uploading} />
      <button onClick={uploadFile} disabled={!file || uploading}>
        {uploading ? "Uploading..." : "Upload"}
      </button>
      <div>Progress: {progress.toFixed(2)}%</div>
      <div>Speed: {speed.toFixed(2)} MB/s</div>
      <div>ETA: {eta !== null ? formatEta(eta) : "N/A"}</div>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}

export default App;