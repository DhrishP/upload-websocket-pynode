from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import base64
import json
import time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    file_path = ""
    start_time = time.time()
    total_bytes = 0

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "start":
                file_name = message["fileName"]
                file_path = os.path.join("uploads", file_name)
                total_bytes = 0
                start_time = time.time()
                
                
                file = open(file_path, "wb")
            elif message["type"] == "chunk":
                chunk = base64.b64decode(message["data"].split(",")[1])
                file.write(chunk)
                total_bytes += len(chunk)
                
                elapsed_time = time.time() - start_time
                speed = total_bytes / elapsed_time if elapsed_time > 0 else 0
                progress = (total_bytes / message["fileSize"]) * 100

                await websocket.send_json({
                    "type": "progress",
                    "progress": progress,
                    "speed": speed / (1024 * 1024)  # Convert to MB/s
                })
            elif message["type"] == "end":
                file.close()
                await websocket.send_json({"type": "complete", "message": "File uploaded successfully"})
                break
    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        if 'file' in locals() and not file.closed:
            file.close()
        await websocket.close()

if __name__ == "__main__":
    if not os.path.exists("uploads"):
        os.makedirs("uploads")
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)