import tempfile
import os
import whisper
import torch
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:5173"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

model = None

def get_model():
    global model
    if model is None:
        # Use Apple Silicon GPU (MPS) if available
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        print(f"Loading Whisper model (small) on {device}...")
        model = whisper.load_model("small", device=device)
        print("Model loaded.")
    return model


import httpx  # Added for proxying
from fastapi.responses import StreamingResponse

@app.get("/proxy_audio")
async def proxy_audio(url: str):
    """
    Proxies audio from Google Drive/External to bypass CORS.
    """
    async def stream_content():
        async with httpx.AsyncClient(follow_redirects=True) as client:
            async with client.stream("GET", url) as response:
                async for chunk in response.aiter_bytes():
                    yield chunk

    return StreamingResponse(stream_content(), media_type="audio/mpeg")


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[1] or ".audio"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # Run transcription on the selected device
        result = get_model().transcribe(tmp_path, word_timestamps=True, language="ja")
    except Exception as e:
        print(f"Error during transcription: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    segments = []
    for seg in result.get("segments", []):
        words = seg.get("words")
        if words:
            for w in words:
                segments.append({
                    "text": w["word"],
                    "start": round(w["start"], 3),
                    "end": round(w["end"], 3),
                })
        else:
            segments.append({
                "text": seg["text"],
                "start": round(seg["start"], 3),
                "end": round(seg["end"], 3),
            })

    return {"segments": segments}
