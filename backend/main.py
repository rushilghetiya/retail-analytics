"""
RetailEns Backend — FastAPI
Endpoints:
  POST /upload       → upload video, start background job
  GET  /job/{id}     → poll job progress
  GET  /analytics/{id} → fetch final analytics JSON
"""

import uuid, os, shutil, asyncio
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from video_processor import VideoProcessor

app = FastAPI(title="RetailEns API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://retail-analytics-flax.vercel.app"],
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory job store (use Redis for production)
jobs: dict = {}
analytics_store: dict = {}


class JobStatus(BaseModel):
    job_id: str
    progress: int
    status: str
    error: Optional[str] = None


@app.post("/upload")
async def upload_video(background_tasks: BackgroundTasks, video: UploadFile = File(...)):
    job_id = str(uuid.uuid4())
    video_path = os.path.join(UPLOAD_DIR, f"{job_id}_{video.filename}")

    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    jobs[job_id] = {"progress": 0, "status": "Queued", "error": None}
    background_tasks.add_task(run_processing, job_id, video_path)

    return {"job_id": job_id, "message": "Processing started"}


async def run_processing(job_id: str, video_path: str):
    def progress_cb(progress: int, status: str):
        jobs[job_id] = {"progress": progress, "status": status, "error": None}

    try:
        processor = VideoProcessor(video_path, progress_cb)
        result = await asyncio.get_event_loop().run_in_executor(None, processor.run)
        analytics_store[job_id] = result
        jobs[job_id] = {"progress": 100, "status": "Analysis complete!", "error": None}
    except Exception as e:
        jobs[job_id] = {"progress": -1, "status": "Failed", "error": str(e)}
    finally:
        if os.path.exists(video_path):
            os.remove(video_path)


@app.get("/job/{job_id}", response_model=JobStatus)
def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    return JobStatus(job_id=job_id, **job)


@app.get("/analytics/{job_id}")
def get_analytics(job_id: str):
    if job_id not in analytics_store:
        raise HTTPException(status_code=404, detail="Analytics not ready or job not found")
    return JSONResponse(content=analytics_store[job_id])


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
