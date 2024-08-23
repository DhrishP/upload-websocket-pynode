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

    try:
        while True:
            # This part is modified to handle both text and binary data
            data = await websocket.receive()
            
            if "text" in data:
                message = json.loads(data["text"])
                
                if message["type"] == "start":
                    file_name = message["fileName"]
                    file_id = message["fileId"]
                    file_path = os.path.join(UPLOAD_DIR, file_name)
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
                    file.write(data["bytes"])
                    total_bytes += len(data["bytes"])

                    elapsed_time = time.time() - start_time
                    speed = total_bytes / elapsed_time if elapsed_time > 0 else 0
                    progress = (total_bytes / message["fileSize"]) * 100

                    upload_progress[file_id] = {
                        "bytesReceived": total_bytes,
                        "progress": progress,
                        "speed": speed / (1024 * 1024)  # Convert to MB/s
                    }

                    await websocket.send_json({
                        "type": "progress",
                        "progress": progress,
                        "speed": speed / (1024 * 1024)  # Convert to MB/s
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
    if not os.path.exists("uploads"):
        os.makedirs("uploads")
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
