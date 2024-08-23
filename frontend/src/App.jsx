import React, { useState, useEffect, useRef } from "react";
import axios from 'axios';

function App() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [fileId, setFileId] = useState(null);
  const ws = useRef(null);
  const retryCount = useRef(0);
  const maxRetries = 5;
  const retryDelay = 3000; 
  const chunkSize = 64 * 1024; 

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
    setProgress(0);
    setSpeed(0);
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
    } else if (message.type === "complete") {
      console.log(message.message);
      setUploading(false);
      setProgress(100);
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
    ws.current.send(JSON.stringify({
      type: "start",
      fileName: file.name,
      fileSize: file.size,
      fileId: fileId
    }));
  };

  const resumeUpload = (bytesReceived) => {
    const reader = new FileReader();
    let offset = bytesReceived;
  
    reader.onload = (e) => {
      const chunk = e.target.result;
      ws.current.send(chunk);
  
      offset += chunkSize;
      if (offset < file.size) {
        readNextChunk(offset);
      } else {
        ws.current.send(JSON.stringify({ type: "end", fileId: fileId }));
      }
    };
  
    const readNextChunk = (chunkOffset) => {
      const slice = file.slice(chunkOffset, chunkOffset + chunkSize);
      reader.readAsArrayBuffer(slice);  // Read as ArrayBuffer for binary data
    };
  
    readNextChunk(offset);
  };
  const uploadFile = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // Check if there's an existing upload
      const response = await axios.get(`http://localhost:3001/upload-status/${fileId}`);
      if (response.data.bytesReceived) {
        setProgress((response.data.bytesReceived / file.size) * 100);
      }
    } catch (error) {
      console.error("Error checking upload status:", error);
    }

    connectWebSocket();
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} disabled={uploading} />
      <button onClick={uploadFile} disabled={!file || uploading}>
        {uploading ? "Uploading..." : "Upload"}
      </button>
      <div>Progress: {progress.toFixed(2)}%</div>
      <div>Speed: {speed.toFixed(2)} MB/s</div>
      {error && <div style={{color: 'red'}}>{error}</div>}
    </div>
  );
}

export default App;
