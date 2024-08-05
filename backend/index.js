const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const upload = multer({ dest: "uploads/", limits: { fileSize: Infinity } });

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json());

app.post("/upload", upload.single("file"), (req, res) => {
  const filePath = req.file.path;
  const fileContent = fs.readFileSync(filePath, "utf8");
  console.log("File content:");
  console.log(fileContent);
  res.json({ message: "File uploaded successfully" });
});

app.post("/upload-chunk", upload.single("chunk"), (req, res) => {
  const { filename, chunkIndex } = req.body;
  const chunk = req.file;
  const filePath = path.join(__dirname, "uploads", filename);
  fs.appendFileSync(filePath, fs.readFileSync(chunk.path));
  fs.unlinkSync(chunk.path); // Clean up the temp file

  if (chunkIndex === "0") {
    console.log(`Started receiving file: ${filename}`);
  }

  res.json({ message: "Chunk uploaded successfully" });
});

io.on("connection", (socket) => {
  console.log("Socket.IO connection established");
  socket.on("upload-progress", (data) => {
    // Broadcast progress to all connected clients
    io.emit("upload-progress", {
      filename: data.filename,
      progress: data.progress,
      speed: data.speed,
    });

    if (data.progress === 100) {
      const filePath = path.join(__dirname, "uploads", data.filename);
      const fileContent = fs.readFileSync(filePath, "utf8");
      console.log(`File upload completed: ${data.filename}`);
      console.log("File content:");
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
