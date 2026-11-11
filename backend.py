import cv2
import os
import tempfile
import uuid
import base64
import numpy as np
from collections import defaultdict
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from ultralytics import YOLO

app = FastAPI(title="FlockVision AI - Interactive Custom Gate Analytics")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_path = "sheep_best.pt"
model = YOLO(model_path)

live_sessions = {}


def draw_corner_box(img, x1, y1, x2, y2, color=(220, 230, 240), thickness=2, corner_len=10):
    cv2.rectangle(img, (x1, y1), (x2, y2), (140, 150, 165), 1)
    cl = min(corner_len, int((x2 - x1) * 0.3), int((y2 - y1) * 0.3))
    cv2.line(img, (x1, y1), (x1 + cl, y1), color, thickness)
    cv2.line(img, (x1, y1), (x1, y1 + cl), color, thickness)
    cv2.line(img, (x2, y1), (x2 - cl, y1), color, thickness)
    cv2.line(img, (x2, y1), (x2, y1 + cl), color, thickness)
    cv2.line(img, (x1, y2), (x1 + cl, y2), color, thickness)
    cv2.line(img, (x1, y2), (x1, y2 - cl), color, thickness)
    cv2.line(img, (x2, y2), (x2 - cl, y2), color, thickness)
    cv2.line(img, (x2, y2), (x2, y2 - cl), color, thickness)


def cross_product_side(px, py, x1, y1, x2, y2):
    """Returns positive or negative depending on which side of line (x1,y1)->(x2,y2) point (px,py) lies"""
    return (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)


def segments_intersect(p1, p2, q1, q2):
    """Checks if sheep movement vector (p1->p2) crossed the drawn gate line segment (q1->q2)"""
    def ccw(A, B, C):
        return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])
    return ccw(p1, q1, q2) != ccw(p2, q1, q2) and ccw(p1, p2, q1) != ccw(p1, p2, q2)


@app.post("/api/count-sheep")
async def count_sheep(
    file: UploadFile = File(...),
    confidence: float = Form(0.25),
):
    contents = await file.read()
    temp_img = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    temp_img.write(contents)
    temp_img.close()

    img = cv2.imread(temp_img.name)
    os.unlink(temp_img.name)

    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image file.")

    h_orig, w_orig = img.shape[:2]
    if w_orig > 1024:
        scale = 1024 / w_orig
        img = cv2.resize(img, (1024, int(h_orig * scale)), interpolation=cv2.INTER_AREA)

    results = model.predict(
        source=img,
        conf=max(confidence, 0.25),
        iou=0.45,
        imgsz=640,
        verbose=False
    )

    boxes = results[0].boxes
    active_count = len(boxes)
    confidences = boxes.conf.cpu().tolist() if boxes.conf is not None else []
    avg_conf = round(sum(confidences) / len(confidences) * 100, 1) if confidences else 0.0

    annotated_img = img.copy()
    for box in boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().tolist())
        cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
        draw_corner_box(annotated_img, x1, y1, x2, y2, color=(255, 210, 0), thickness=2)
        cv2.circle(annotated_img, (cx, cy), 7, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.circle(annotated_img, (cx, cy), 4, (235, 70, 160), -1, cv2.LINE_AA)

    overlay = annotated_img.copy()
    cv2.rectangle(overlay, (12, 12), (285, 92), (30, 22, 15), -1)
    cv2.addWeighted(overlay, 0.78, annotated_img, 0.22, 0, annotated_img)
    cv2.rectangle(annotated_img, (12, 12), (285, 92), (255, 190, 0), 1)

    cv2.putText(annotated_img, "FLOCKVISION AI | STATIC SCAN", (22, 36),
                cv2.FONT_HERSHEY_SIMPLEX, 0.46, (255, 200, 50), 1, cv2.LINE_AA)
    cv2.putText(annotated_img, f"Sheep Count: {active_count}", (22, 70),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)

    _, buffer = cv2.imencode(".jpg", annotated_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    img_base64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "active_in_zone": active_count,
        "gate_inbound": active_count,
        "reverse_exits": 0,
        "net_flock_count": active_count,
        "throughput_per_min": 0.0,
        "flow_density": "STATIC SCAN",
        "average_confidence": avg_conf,
        "annotated_image": f"data:image/jpeg;base64,{img_base64}",
        "entry_logs": [],
    }


@app.post("/api/upload-video-stream")
async def upload_video_stream(
    file: UploadFile = File(...),
    confidence: float = Form(0.25),
    x1: float = Form(0.10),
    y1: float = Form(0.65),
    x2: float = Form(0.90),
    y2: float = Form(0.65),
):
    session_id = str(uuid.uuid4())
    temp_input = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
    temp_input.write(await file.read())
    temp_input.close()

    live_sessions[session_id] = {
        "video_path": temp_input.name,
        "confidence": confidence,
        "line_coords": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
        "total_frames_processed": 0,
        "active_in_zone": 0,
        "gate_inbound": 0,
        "reverse_exits": 0,
        "net_flock_count": 0,
        "throughput_per_min": 0.0,
        "flow_density": "SMOOTH FLOW",
        "average_confidence": 0.0,
        "entry_logs": [],
        "is_finished": False,
    }

    return {
        "session_id": session_id,
        "stream_url": f"http://127.0.0.1:8000/api/live-video-feed/{session_id}"
    }


@app.post("/api/update-line/{session_id}")
async def update_line_coordinates(
    session_id: str,
    x1: float = Form(...),
    y1: float = Form(...),
    x2: float = Form(...),
    y2: float = Form(...),
):
    """Updates the 2D gate line coordinates (horizontal, vertical, or angled) live"""
    if session_id in live_sessions:
        live_sessions[session_id]["line_coords"] = {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
        return {"status": "ok", "line_coords": live_sessions[session_id]["line_coords"]}
    raise HTTPException(status_code=404, detail="Session not found")


@app.get("/api/live-video-feed/{session_id}")
def live_video_feed(session_id: str):
    if session_id not in live_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = live_sessions[session_id]
    vid_path = session["video_path"]
    conf = session["confidence"]

    def generate():
        cap = cv2.VideoCapture(vid_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        TARGET_WIDTH = 768

        track_history = defaultdict(list)
        counted_inbound = set()
        counted_reverse = set()
        recent_inbound_pts = []
        recent_reverse_pts = []
        all_confidences = []
        frame_idx = 0
        gate_flash_frames = 0

        while cap.isOpened():
            ret, raw_frame = cap.read()
            if not ret:
                break

            frame_idx += 1
            if frame_idx % 2 != 0:
                continue

            session["total_frames_processed"] = frame_idx

            orig_h, orig_w = raw_frame.shape[:2]
            if orig_w > TARGET_WIDTH:
                scale_ratio = TARGET_WIDTH / float(orig_w)
                new_h = int(orig_h * scale_ratio)
                frame = cv2.resize(raw_frame, (TARGET_WIDTH, new_h), interpolation=cv2.INTER_LINEAR)
            else:
                frame = raw_frame

            h, w = frame.shape[:2]
            coords = session.get("line_coords", {"x1": 0.10, "y1": 0.65, "x2": 0.90, "y2": 0.65})
            lx1, ly1 = int(w * coords["x1"]), int(h * coords["y1"])
            lx2, ly2 = int(w * coords["x2"]), int(h * coords["y2"])

            results = model.track(
                source=frame,
                conf=max(conf, 0.25),
                iou=0.45,
                imgsz=480,
                persist=True,
                tracker="bytetrack.yaml",
                verbose=False
            )

            boxes = results[0].boxes
            annotated_frame = frame

            if boxes.conf is not None:
                all_confidences.extend(boxes.conf.cpu().tolist())

            if boxes.id is not None:
                ids = boxes.id.int().cpu().tolist()
                xyxy = boxes.xyxy.cpu().tolist()

                for tid, box in zip(ids, xyxy):
                    x1, y1, x2, y2 = map(int, box)
                    cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)

                    history = track_history[tid]
                    history.append((cx, cy))
                    if len(history) > 10:
                        history.pop(0)

                    # Universal 2D Line Segment Intersection (Works for Horizontal, Vertical & Diagonal Gates)
                    if len(history) >= 2:
                        prev_pt = history[-2]
                        first_pt = history[0]
                        curr_pt = (cx, cy)
                        gate_p1 = (lx1, ly1)
                        gate_p2 = (lx2, ly2)

                        crossed_recent = segments_intersect(prev_pt, curr_pt, gate_p1, gate_p2)
                        crossed_overall = segments_intersect(first_pt, curr_pt, gate_p1, gate_p2)

                        if crossed_recent or crossed_overall:
                            ref_pt = prev_pt if crossed_recent else first_pt
                            prev_side = cross_product_side(ref_pt[0], ref_pt[1], lx1, ly1, lx2, ly2)
                            curr_side = cross_product_side(cx, cy, lx1, ly1, lx2, ly2)

                            # Forward Gate Entry (Crossed from + side to - side)
                            if prev_side >= 0 and curr_side < 0:
                                if tid not in counted_inbound:
                                    is_dup = any(
                                        ((cx - ox) ** 2 + (cy - oy) ** 2) ** 0.5 < 38
                                        for (ox, oy, f_old) in recent_inbound_pts
                                        if (frame_idx - f_old) < 25
                                    )
                                    counted_inbound.add(tid)
                                    if not is_dup:
                                        session["gate_inbound"] += 1
                                        gate_flash_frames = 3
                                        recent_inbound_pts.append((cx, cy, frame_idx))
                                        sec = frame_idx / fps
                                        timestamp = f"{int(sec // 60):02d}:{sec % 60:05.2f}"
                                        session["entry_logs"].insert(0, {
                                            "order": session["gate_inbound"] + session["reverse_exits"],
                                            "sheep_id": f"SHEEP-{tid:03d}",
                                            "event": "GATE ENTRY",
                                            "timestamp": timestamp
                                        })

                            # Reverse Gate Exit (Crossed from - side to + side)
                            elif prev_side <= 0 and curr_side > 0:
                                if tid not in counted_reverse:
                                    is_dup = any(
                                        ((cx - ox) ** 2 + (cy - oy) ** 2) ** 0.5 < 38
                                        for (ox, oy, f_old) in recent_reverse_pts
                                        if (frame_idx - f_old) < 25
                                    )
                                    counted_reverse.add(tid)
                                    if not is_dup:
                                        session["reverse_exits"] += 1
                                        gate_flash_frames = 3
                                        recent_reverse_pts.append((cx, cy, frame_idx))
                                        sec = frame_idx / fps
                                        timestamp = f"{int(sec // 60):02d}:{sec % 60:05.2f}"
                                        session["entry_logs"].insert(0, {
                                            "order": session["gate_inbound"] + session["reverse_exits"],
                                            "sheep_id": f"SHEEP-{tid:03d}",
                                            "event": "REVERSE EXIT",
                                            "timestamp": timestamp
                                        })

                    box_color = (120, 255, 140) if tid in counted_inbound else (235, 235, 245)
                    draw_corner_box(annotated_frame, x1, y1, x2, y2, color=box_color, thickness=2, corner_len=9)

                    cv2.circle(annotated_frame, (cx, cy), 6, (255, 255, 255), 1, cv2.LINE_AA)
                    cv2.circle(annotated_frame, (cx, cy), 4, (230, 65, 175), -1, cv2.LINE_AA)

                    if len(history) >= 2:
                        old_x, old_y = history[0]
                        dx, dy = cx - old_x, cy - old_y
                        mag = (dx ** 2 + dy ** 2) ** 0.5
                        if mag > 2:
                            end_x = int(cx + (dx / mag) * min(mag * 1.8, 28))
                            end_y = int(cy + (dy / mag) * min(mag * 1.8, 28))
                            cv2.arrowedLine(
                                annotated_frame,
                                (cx, cy),
                                (end_x, end_y),
                                (0, 215, 255),
                                2,
                                cv2.LINE_AA,
                                tipLength=0.35
                            )

            # Draw Custom User-Defined Sensor Gate Line
            if gate_flash_frames > 0:
                gate_color = (80, 255, 120)
                gate_thickness = 4
                gate_flash_frames -= 1
            else:
                gate_color = (255, 215, 0)
                gate_thickness = 2

            cv2.line(annotated_frame, (lx1, ly1), (lx2, ly2), gate_color, gate_thickness, cv2.LINE_AA)
            cv2.circle(annotated_frame, (lx1, ly1), 6, (0, 140, 255), -1, cv2.LINE_AA)
            cv2.circle(annotated_frame, (lx2, ly2), 6, (0, 140, 255), -1, cv2.LINE_AA)

            mid_x, mid_y = int((lx1 + lx2) / 2), int((ly1 + ly2) / 2)
            cv2.putText(annotated_frame, "CUSTOM GATE", (mid_x - 45, max(20, mid_y - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, gate_color, 1, cv2.LINE_AA)

            active_in_zone = len(boxes)
            inbound = session["gate_inbound"]
            reverse = session["reverse_exits"]
            net_flock = max(0, inbound - reverse)
            elapsed_seconds = max(frame_idx / fps, 1.0)
            throughput = round((inbound / elapsed_seconds) * 60.0, 1)

            if active_in_zone >= 25:
                density_label = "HIGH CROWDING"
                density_bgr = (60, 80, 255)
            elif active_in_zone >= 12:
                density_label = "MODERATE FLOW"
                density_bgr = (0, 215, 255)
            else:
                density_label = "SMOOTH FLOW"
                density_bgr = (120, 255, 120)

            session["active_in_zone"] = active_in_zone
            session["net_flock_count"] = net_flock
            session["throughput_per_min"] = throughput
            session["flow_density"] = density_label

            if all_confidences:
                session["average_confidence"] = round((sum(all_confidences) / len(all_confidences)) * 100, 1)

            hud_x1, hud_y1, hud_x2, hud_y2 = 10, 10, 255, 175
            roi = annotated_frame[hud_y1:hud_y2, hud_x1:hud_x2]
            dark_rect = np.full(roi.shape, (28, 20, 14), dtype=np.uint8)
            cv2.addWeighted(dark_rect, 0.78, roi, 0.22, 0, roi)
            cv2.rectangle(annotated_frame, (hud_x1, hud_y1), (hud_x2, hud_y2), (255, 195, 0), 1)

            cv2.putText(annotated_frame, "FLOCKVISION | GATE-01", (20, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 200, 40), 1, cv2.LINE_AA)
            cv2.putText(annotated_frame, f"In Frame: {active_in_zone}", (20, 56),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.putText(annotated_frame, f"Entered: +{inbound}", (20, 82),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.58, (120, 255, 140), 2, cv2.LINE_AA)
            cv2.putText(annotated_frame, f"Reversed: {reverse}", (20, 108),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.58, (110, 130, 255), 2, cv2.LINE_AA)
            cv2.putText(annotated_frame, f"Speed: {throughput}/min", (20, 134),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.58, (0, 220, 255), 2, cv2.LINE_AA)
            cv2.putText(annotated_frame, f"{density_label}", (20, 160),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.54, density_bgr, 2, cv2.LINE_AA)

            success, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
            if not success:
                continue
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

        cap.release()
        session["is_finished"] = True

    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/api/live-stats/{session_id}")
def get_live_stats(session_id: str):
    if session_id not in live_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return live_sessions[session_id]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend:app", host="127.0.0.1", port=8000, reload=True)