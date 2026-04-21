# 🏪 RetailEns — Retail Store Analytics Platform

AI-powered retail video analytics. Upload CCTV footage → get heatmaps, dwell time, queue analytics, and shelf interaction reports instantly.

---

## 📁 Project Structure

```
retail-analytics/
├── backend/
│   ├── main.py              # FastAPI app
│   ├── video_processor.py   # YOLOv8 + DeepSORT pipeline
│   └── requirements.txt
└── frontend/
    └── src/
        └── App.jsx          # React dashboard
```

---

## 🚀 Setup Instructions

### 1. Backend (Python + FastAPI)

**Requirements:** Python 3.10+

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server
python main.py
# → API running at http://localhost:8000
# → Swagger docs at http://localhost:8000/docs
```

> **Note on AI models:** On first run, YOLOv8 will auto-download `yolov8n.pt` (~6MB).
> If ultralytics/torch aren't installed, the system automatically falls back to simulation mode.

---

### 2. Frontend (React)

**Requirements:** Node 18+

```bash
cd frontend

# If starting from scratch with Vite:
npm create vite@latest . -- --template react
npm install

# Replace src/App.jsx with the provided App.jsx
# Then start:
npm run dev
# → Dashboard at http://localhost:5173
```

---

## 🔌 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/upload` | POST | Upload video file, returns `job_id` |
| `/job/{id}` | GET | Poll progress (0-100) and status message |
| `/analytics/{id}` | GET | Get final analytics JSON when job is done |
| `/health` | GET | Health check |

### Analytics Response Schema

```json
{
  "total": 342,
  "avgDwell": 187.3,
  "peakHour": "14:00",
  "queueAvg": 4.2,
  "heatmap": [[0.1, 0.4, ...], ...],
  "zones": [
    {
      "name": "Entrance",
      "dwell": 45.2,
      "interactions": 89,
      "color": "#00f5d4"
    }
  ],
  "hours": [
    { "hour": "8:00", "visitors": 23, "queue": 1.2 },
    ...
  ]
}
```

---

## 🧠 AI Pipeline Details

### Detection: YOLOv8n
- Detects people in each frame (class 0)
- Confidence threshold: 0.4
- Runs at ~5 FPS sample rate for speed

### Tracking: DeepSORT
- Assigns persistent IDs across frames
- `max_age=30` frames before ID is dropped
- `n_init=3` detections to confirm a track

### Analytics Computed

| Metric | Method |
|--------|--------|
| **Heatmap** | Gaussian-smoothed accumulation grid of all person positions |
| **Unique visitors** | Count of unique DeepSORT track IDs |
| **Dwell time** | Sum of time spent per zone per track ID |
| **Queue length** | Count of active tracks inside the Checkout zone per frame |
| **Shelf interactions** | Zone entry events in Shelf Zone |
| **Hourly traffic** | Unique IDs seen per 1-hour time bucket |

### Zone Configuration

Edit `ZONES` dict in `video_processor.py` to match your store layout:

```python
ZONES = {
    "Entrance":    (0.00, 0.75, 0.15, 1.00),  # (x1%, y1%, x2%, y2%)
    "Aisle A":     (0.15, 0.00, 0.40, 1.00),
    "Checkout":    (0.75, 0.65, 1.00, 1.00),
    # Add your zones here...
}
```

---

## ⚙️ Production Considerations

- **Job Queue:** Replace in-memory `jobs` dict with **Redis + Celery** for multi-worker processing
- **Storage:** Use **S3 / GCS** for uploaded videos instead of local filesystem
- **Database:** Store analytics in **PostgreSQL** with SQLAlchemy
- **Auth:** Add JWT authentication for the API
- **GPU:** Install `torch` with CUDA for 10x faster processing on GPU machines

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Charts | Custom canvas + CSS |
| Backend | FastAPI + Uvicorn |
| Detection | YOLOv8 (Ultralytics) |
| Tracking | DeepSORT |
| CV | OpenCV |
| Numerics | NumPy |
