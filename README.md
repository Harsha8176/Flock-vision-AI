# 🐑 FlockVision AI
### Intelligent Sheep Detection, Tracking & Gate Flow Analytics

**FlockVision AI** is an end-to-end computer vision application for automated sheep detection, multi-object tracking, directional counting, and livestock movement analytics.

Built using **YOLO, ByteTrack, OpenCV, FastAPI, and React**, the system transforms uploaded images and videos into actionable insights about flock movement and livestock activity.

The project demonstrates the integration of deep learning inference, object tracking, geometric line-crossing algorithms, REST APIs, and an interactive web interface.

## 🚀 Key Features

### 🔍 AI-Powered Sheep Detection
- Detect sheep in uploaded images using a YOLO model.
- Generate annotated detection results with bounding boxes.
- Calculate the total number of detected sheep.
- Display average detection confidence.

### 🎯 Multi-Object Tracking
- Track individual sheep across video frames using ByteTrack.
- Associate detections with tracking IDs.
- Maintain short movement histories.
- Visualize movement directions with arrows.

### 🚧 Custom Virtual Gate
- Define a virtual counting line within the video.
- Support horizontal, vertical, and diagonal gate orientations.
- Dynamically update gate coordinates during a session.
- Detect sheep crossing the virtual gate.

### 🔄 Bidirectional Movement Counting
- Count sheep entering through the gate.
- Detect reverse-direction crossings.
- Maintain separate inbound and reverse-exit counters.
- Calculate the net flock count.
- Apply duplicate-counting safeguards using tracking IDs and spatial proximity.

### 📊 Flock Flow Analytics
- Monitor the number of sheep currently visible.
- Calculate inbound throughput per minute.
- Classify crowding into smooth, moderate, and high-density categories.
- Record gate-crossing events with timestamps.
- Display analytics on annotated video frames.

### 🌐 Full-Stack Application
- FastAPI backend for inference and video processing.
- React frontend for interacting with the application.
- Video streaming of annotated detection results.
- Session-based processing and analytics.

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| Programming | Python, JavaScript |
| Object Detection | Ultralytics YOLO |
| Object Tracking | ByteTrack |
| Computer Vision | OpenCV, NumPy |
| Backend | FastAPI, Uvicorn |
| Frontend | React |
| API Communication | HTTP REST APIs |
| Version Control | Git, GitHub |

## 🏗️ System Architecture

```text
                  FlockVision AI
                        |
                React Frontend
                        |
                 FastAPI Backend
                        |
              Image / Video Input
                        |
                 OpenCV Processing
                        |
                 YOLO Detection
                        |
                +-------+-------+
                |               |
           Image Mode       Video Mode
                |               |
         Bounding Boxes    ByteTrack Tracking
                |               |
          Sheep Count      Tracking IDs
                                |
                        Virtual Gate Logic
                                |
                     Directional Counting
                                |
                         Flow Analytics
                                |
                       Annotated Stream
                                |
                        React Dashboard
```

## 📁 Project Structure

```text
Flock-vision-AI/
│
├── backend.py
├── frontend/
│   └── ...
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

The backend expects a YOLO model weights file named `sheep_best.pt` in the project root. Model weights must be provided separately if they are not included in the repository.

## ⚙️ Installation & Setup

### Prerequisites

- Python 3.10 or newer
- Node.js and npm
- Git
- Compatible YOLO model weights

### 1. Clone the Repository

```bash
git clone https://github.com/Harsha8176/Flock-vision-AI.git
cd Flock-vision-AI
```

### 2. Configure the Backend

Create a virtual environment:

```bash
python -m venv .venv
```

Activate it on Windows:

```powershell
.venv\Scripts\activate
```

Install the backend dependencies:

```bash
pip install fastapi uvicorn ultralytics opencv-python numpy python-multipart
```

Place your compatible model weights at:

```text
Flock-vision-AI/sheep_best.pt
```

Start the backend:

```bash
uvicorn backend:app --reload
```

Backend URL:

`http://127.0.0.1:8000`

Interactive API documentation:

`http://127.0.0.1:8000/docs`

### 3. Configure the Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by the development server.

## 🔌 Backend API

| Endpoint | Method | Description |
|---|---|---|
| `/api/count-sheep` | POST | Detect and count sheep in an image |
| `/api/upload-video-stream` | POST | Upload a video and initialize an analysis session |
| `/api/update-line/{session_id}` | POST | Update virtual gate coordinates |
| `/api/live-video-feed/{session_id}` | GET | Stream annotated video frames |

### Image Detection

The image endpoint accepts an uploaded image and an optional confidence threshold.

It returns detection information including:
- Number of detected sheep
- Average detection confidence
- Annotated image
- Static-scan analytics

### Video Analytics

The video processing pipeline performs YOLO inference, ByteTrack tracking, virtual gate intersection checks, directional counting, and frame annotation.

The system maintains session information such as inbound counts, reverse exits, net flock count, throughput, and event logs.

## 🧠 How the Counting Algorithm Works

1. YOLO detects sheep in a video frame.
2. ByteTrack assigns tracking IDs to detected sheep.
3. The system records each sheep's recent center positions.
4. A geometric intersection algorithm checks whether a sheep's movement crosses the virtual gate.
5. The direction of crossing determines whether the event is an entry or reverse exit.
6. Tracking IDs and spatial checks help reduce duplicate counting.
7. The system updates movement statistics and displays annotated results.

### Net Flock Count

```text
Net Flock Count = max(0, Inbound Crossings - Reverse Exits)
```

### Throughput

```text
Throughput = (Inbound Crossings / Elapsed Seconds) × 60
```

These values describe detected gate-crossing events and depend on tracking quality, camera placement, and detection performance.

## ⚡ Inference Optimizations

The current video processing implementation includes:

- Processing alternate video frames to reduce computational workload.
- Resizing large frames before inference.
- Configurable confidence filtering.
- Reduced inference image resolution for video processing.
- Persistent tracking across processed frames.
- JPEG-based annotated video streaming.

These are implementation-level optimizations; measured FPS, latency, and hardware benchmarks have not yet been published.

## 📸 Screenshots & Demo

Add screenshots or demo media showing:

- FlockVision AI dashboard
- Sheep detection results
- Virtual gate placement
- Directional counting in action
- Flow analytics and event logs

A short demo video or GIF can help illustrate the tracking and gate-counting functionality.

## ⚠️ Current Limitations

- Detection quality depends on model training data and video conditions.
- Occlusion and crowded scenes can affect tracking consistency.
- Tracking ID changes may affect directional counting.
- Video analytics currently operate on uploaded video files.
- Session information is maintained in application memory.
- Production deployment, persistent storage, and benchmark results are not yet documented.

## 🔮 Future Enhancements

- Live RTSP/IP camera integration
- Edge AI deployment using optimized models
- Cloud deployment and containerization
- Persistent analytics database
- Automated analytics reports
- Comparison of ByteTrack and BoT-SORT
- ONNX and TensorRT inference optimization
- Evaluation using precision, recall, mAP, IDF1, and HOTA
- Improved multi-camera livestock tracking

## 🎯 Potential Applications

- Automated sheep counting
- Livestock entry and exit monitoring
- Farm gate analytics
- Flock movement analysis
- Smart agriculture research
- Computer vision experimentation

## 👨‍💻 Author

**Harsha8176**

GitHub: https://github.com/Harsha8176

Project Repository: https://github.com/Harsha8176/Flock-vision-AI

## 📄 License

No license is currently specified. All rights are reserved unless a license is added.

---

**FlockVision AI — Turning livestock movement into intelligent visual analytics.**

