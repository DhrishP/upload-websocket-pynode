import React, { useState, useEffect, useRef } from "react";

function App() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const ws = useRef(null);
  const chunkSize = 64 * 1024; // 64KB chunks

  useEffect(() => {
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setProgress(0);
    setSpeed(0);
    setError(null);
  };

  const uploadFile = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    ws.current = new WebSocket("ws://localhost:3001/ws");

    ws.current.onopen = () => {
      console.log("WebSocket connection established");
      
      // Send start message
      ws.current.send(JSON.stringify({
        type: "start",
        fileName: file.name,
        fileSize: file.size
      }));

      // Start sending file chunks
      const reader = new FileReader();
      let offset = 0;

      reader.onload = (e) => {
        const chunk = e.target.result;
        ws.current.send(JSON.stringify({
          type: "chunk",
          data: chunk,
          fileSize: file.size
        }));

        offset += chunkSize;
        if (offset < file.size) {
          readNextChunk();
        } else {
          // Send end message
          ws.current.send(JSON.stringify({ type: "end" }));
        }
      };

      const readNextChunk = () => {
        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsDataURL(slice);
      };

      readNextChunk();
    };

    ws.current.onmessage = (event) => {
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
      }
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setError("Connection error. Please try again.");
      setUploading(false);
    };

    ws.current.onclose = () => {
      console.log("WebSocket connection closed");
      if (uploading) {
        setError("Connection closed unexpectedly. Please try again.");
        setUploading(false);
      }
    };
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