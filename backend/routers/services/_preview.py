"""Preview de detecciones: muestrea frames del video y devuelve detecciones
serializadas (bbox normalizado + crop en base64) para la selección de targets."""
from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np
import supervision as sv

from routers.services._config import filter_detections

DEFAULT_SAMPLE_FPS = 1.0
MAX_SAMPLED_FRAMES = 60
CROP_MAX_SIZE = 96


def sample_frames(path: str, sample_fps: float = DEFAULT_SAMPLE_FPS,
                  max_frames: int = MAX_SAMPLED_FRAMES) -> tuple[list[tuple[int, np.ndarray]], float]:
    """Devuelve [(frame_idx, frame)] muestreados y el fps del video."""
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(fps / sample_fps)))
    sampled: list[tuple[int, np.ndarray]] = []
    idx = 0
    while cap.isOpened() and len(sampled) < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step == 0:
            sampled.append((idx, frame))
        idx += 1
    cap.release()
    return sampled, fps


def _crop_b64(frame: np.ndarray, bbox: tuple[int, int, int, int]) -> str:
    x1, y1, x2, y2 = (max(0, int(v)) for v in bbox)
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return ""
    h, w = crop.shape[:2]
    scale = CROP_MAX_SIZE / max(h, w)
    if scale < 1:
        crop = cv2.resize(crop, (max(1, int(w * scale)), max(1, int(h * scale))))
    ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return base64.b64encode(buf).decode() if ok else ""


def sample_detections(frames: list[tuple[int, np.ndarray]], model: Any,
                      config: dict) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for frame_idx, frame in frames:
        h, w = frame.shape[:2]
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        entries = []
        for i in range(len(detections)):
            x1, y1, x2, y2 = (float(v) for v in detections.xyxy[i])
            class_id = int(detections.class_id[i]) if detections.class_id is not None else -1
            entries.append({
                "bbox": {"x1": x1 / w, "y1": y1 / h, "x2": x2 / w, "y2": y2 / h},
                "class_name": (result.names or {}).get(class_id, "object"),
                "confidence": float(detections.confidence[i]) if detections.confidence is not None else 0.0,
                "crop_b64": _crop_b64(frame, (int(x1), int(y1), int(x2), int(y2))),
            })
        out.append({"frame_idx": frame_idx, "detections": entries})
    return out
