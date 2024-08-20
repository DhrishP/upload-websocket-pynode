from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import base64
import json
import time
import tempfile

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://192.168.0.112:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


upload_progress = {}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    file_path = ""
    temp_file_path = ""
    start_time = time.time()
    total_bytes = 0
    file_id = None

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "start":
                file_name = message["fileName"]
                file_id = message["fileId"]
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

            elif message["type"] == "chunk":
                chunk = base64.b64decode(message["data"].split(",")[1])
                file.write(chunk)
                total_bytes += len(chunk)
                
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
        if 'file' in locals() and not file.closed:
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
    uvicorn.run(app, host="192.168.0.112", port=3001)