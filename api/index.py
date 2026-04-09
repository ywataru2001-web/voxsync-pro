from fastapi import FastAPI, Response
from fastapi.responses import StreamingResponse
import httpx
import os

app = FastAPI()

@app.get("/api/proxy_audio")
async def proxy_audio(url: str):
    """
    Proxies audio from Google Drive to bypass CORS for Vercel deployment.
    """
    async def stream_content():
        async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
            async with client.stream("GET", url) as response:
                async for chunk in response.aiter_bytes():
                    yield chunk

    # Return a streaming response with the correct media type
    return StreamingResponse(stream_content(), media_type="audio/mpeg")

@app.get("/api/health")
async def health():
    return {"status": "ok"}
