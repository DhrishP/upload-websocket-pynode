from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import socketio
import uvicorn
import os
import shutil
import time

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Socket.IO setup
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins=["http://localhost:5173"])
socket_app = socketio.ASGIApp(sio, app)

# Mount Socket.IO app to FastAPI
app.mount("/socket.io", socket_app)

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    file_path = os.path.join("uploads", file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    with open(file_path, "r") as f:
        file_content = f.read()
        print("File content:")
        print(file_content)

    return JSONResponse(content={"message": "File uploaded successfully"})

@app.post("/api/upload-chunk")
async def upload_chunk(
 chunk: UploadFile = File(...),
    filename: str = Form(...),
    chunkIndex: str = Form(...),
    totalChunks: str = Form(...),
    totalSize: str = Form(...)
):
    try:
        # Log received data for debugging
        print(f"Received: filename={filename}, chunkIndex={chunkIndex}, totalChunks={totalChunks}, totalSize={totalSize}")

        # Ensure the uploads directory exists
        if not os.path.exists("uploads"):
            os.makedirs("uploads")

        file_path = os.path.join("uploads", filename)

        # Calculate the upload speed
        start_time = time.time()
        chunk_data = chunk.file.read()
        chunk_size = len(chunk_data)
        chunk.file.seek(0)

        # Append chunk data to the file
        with open(file_path, "ab") as f:
            f.write(chunk_data)

        end_time = time.time()
        upload_time = end_time - start_time
        speed = chunk_size / upload_time if upload_time > 0 else 0  # Bytes per second

        # Calculate progress
        current_size = os.path.getsize(file_path)
        progress = (current_size / int(totalSize)) * 100

        # Emit progress to the frontend
        await sio.emit('upload-progress', {
            'filename': filename,
            'progress': progress,
            'speed': speed,
        })

        # Log the start of the file upload
        if chunkIndex == "0":
            print(f"Started receiving file: {filename}")

        # If this is the last chunk, log completion
        if chunkIndex == str(int(totalChunks) - 1):
            print(f"File upload completed: {filename}")

        return JSONResponse(content={"message": "Chunk uploaded successfully"})

    except Exception as e:
        print(f"Error uploading chunk: {e}")
        return JSONResponse(content={"message": "Error uploading chunk"}, status_code=500)

# Socket.IO events
@sio.event
async def connect(sid, environ):
    print(f"Socket.IO connection established: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Socket.IO connection closed: {sid}")

@sio.event
async def upload_progress(sid, data):
    await sio.emit('upload-progress', data)

if __name__ == "__main__":
    if not os.path.exists("uploads"):
        os.makedirs("uploads")
    uvicorn.run(app, host="0.0.0.0", port=3001)
