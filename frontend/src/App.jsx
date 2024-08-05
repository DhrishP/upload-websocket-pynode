import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

function App() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const socket = useRef(null);
  const uploadStartTime = useRef(null);
  const lastUpdateTime = useRef(null);
  const lastUploadedBytes = useRef(0);

  useEffect(() => {
    socket.current = io("http://localhost:3001", {
      withCredentials: true,
      transports: ['websocket']
    });

    socket.current.on("connect", () => {
      console.log("Connected to server");
    });

    socket.current.on("upload-progress", (data) => {
      console.log("Received upload progress:", data);
      setProgress(data.progress);
      
      // Calculate speed
      const currentTime = Date.now();
      const elapsedSinceLastUpdate = (currentTime - lastUpdateTime.current) / 1000; // in seconds
      const bytesUploaded = (data.progress / 100) * file.size;
      const bytesSinceLastUpdate = bytesUploaded - lastUploadedBytes.current;
      
      const speedMBps = ((bytesSinceLastUpdate / elapsedSinceLastUpdate) / (1024 * 1024)).toFixed(2);
      setSpeed(speedMBps);

      // Update references for next calculation
      lastUpdateTime.current = currentTime;
      lastUploadedBytes.current = bytesUploaded;
    });

    return () => {
      if (socket.current) {
        socket.current.disconnect();
      }
    };
  }, [file]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setProgress(0);
    setSpeed(0);
    lastUploadedBytes.current = 0;
    lastUpdateTime.current = null;
  };

  const uploadChunk = async (chunk, chunkIndex, totalChunks, totalSize) => {
    const formData = new FormData();
    formData.append("chunk", chunk);
    formData.append("filename", file.name);
    formData.append("chunkIndex", chunkIndex.toString());
    formData.append("totalChunks", totalChunks.toString());
    formData.append("totalSize", totalSize.toString());

    await axios.post("http://localhost:3001/api/upload-chunk", formData);
  };

  const handleUpload = async () => {
    if (!file) return;

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const totalSize = file.size;
    uploadStartTime.current = Date.now();
    lastUpdateTime.current = Date.now();
    lastUploadedBytes.current = 0;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const chunk = file.slice(
        chunkIndex * CHUNK_SIZE,
        (chunkIndex + 1) * CHUNK_SIZE
      );
      await uploadChunk(new Blob([chunk]), chunkIndex, totalChunks, totalSize);
    }

    console.log("Upload completed");
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      <button onClick={handleUpload}>Upload</button>
      <div>Progress: {progress.toFixed(2)}%</div>
      <div>Speed: {speed} MB/s</div>
    </div>
  );
}

export default App;