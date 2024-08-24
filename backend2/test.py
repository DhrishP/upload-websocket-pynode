from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import time
import tempfile

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_progress = {}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    file_path = ""
    temp_file_path = ""
    start_time = time.time()
    total_bytes = 0
    file_id = None
    file = None
    file_size = 0

    try:
        while True:
            data = await websocket.receive()
            
            if "text" in data:
                message = json.loads(data["text"])
                
                if message["type"] == "start":
                    file_name = message["fileName"]
                    file_id = message["fileId"]
                    file_size = message["fileSize"]
                    file_path = os.path.join("uploads", file_name)
                    temp_file_path = os.path.join(tempfile.gettempdir(), f"{file_id}.part")
                    if os.path.exists(temp_file_path):
                        total_bytes = os.path.getsize(temp_file_path)
                    else:
                        total_bytes = 0
                    start_time = time.time()
                    file = open(temp_file_path, "ab")
                    await websocket.send_json({
                        "type": "resume",
                        "bytesReceived": total_bytes
                    })
            elif "bytes" in data:
                if file:
                    chunk = data["bytes"]
                    file.write(chunk)
                    total_bytes += len(chunk)
                    elapsed_time = time.time() - start_time
                    speed = total_bytes / elapsed_time if elapsed_time > 0 else 0
                    progress = (total_bytes / file_size) * 100
                    
                    # Calculate ETA
                    if speed > 0:
                        remaining_bytes = file_size - total_bytes
                        eta_seconds = remaining_bytes / speed
                    else:
                        eta_seconds = float('inf')
                    
                    upload_progress[file_id] = {
                        "bytesReceived": total_bytes,
                        "progress": progress,
                        "speed": speed / (1024 * 1024),  # Convert to MB/s
                        "eta": eta_seconds
                    }
                    
                    await websocket.send_json({
                        "type": "progress",
                        "progress": progress,
                        "speed": speed / (1024 * 1024),  # Convert to MB/s
                        "eta": eta_seconds
                    })
            elif message["type"] == "end":
                if file:
                    file.close()
                os.rename(temp_file_path, file_path)
                if file_id in upload_progress:
                    del upload_progress[file_id]
                await websocket.send_json({"type": "complete", "message": "File uploaded successfully"})
                break
    except WebSocketDisconnect:
        print(f"WebSocket disconnected for file: {file_id}")
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        if file and not file.closed:
            file.close()
        await websocket.close()

@app.get("/upload-status/{file_id}")
async def get_upload_status(file_id: str):
    if file_id in upload_progress:
        return upload_progress[file_id]
    else:
        return {"error": "Upload not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)