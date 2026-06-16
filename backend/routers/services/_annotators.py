"""
Factory de anotadores por estilo, compartida por los servicios CV.
Cada target trae styles[] y color; se renderiza solo lo elegido.
"""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np
import supervision as sv

_DEFAULT_BGR = (204, 255, 0)  # #00ffcc


def hex_to_bgr(value: str) -> tuple[int, int, int]:
    raw = (value or "").lstrip("#")
    if len(raw) != 6:
        return _DEFAULT_BGR
    try:
        r, g, b = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    except ValueError:
        return _DEFAULT_BGR
    return (b, g, r)


def _color(target: dict[str, Any]) -> sv.Color:
    b, g, r = hex_to_bgr(target.get("color", ""))
    return sv.Color(r=r, g=g, b=b)


def build_annotators(target: dict[str, Any]) -> dict[str, Any]:
    """Crea los anotadores supervision para un target. Uno por target para
    que cada uno conserve su color y su propio buffer de trace."""
    color = _color(target)
    palette = sv.ColorPalette(colors=[color])
    return {
        "box": sv.BoxAnnotator(color=palette),
        "ellipse": sv.EllipseAnnotator(color=palette),
        "triangle": sv.TriangleAnnotator(color=palette),
        "color": sv.ColorAnnotator(color=palette, opacity=0.4),
        "trace": sv.TraceAnnotator(color=palette, trace_length=60),
        "label": sv.LabelAnnotator(color=palette),
    }


def apply_spotlight(frame: np.ndarray, bboxes: list[tuple[int, int, int, int]],
                    dim_factor: float = 0.35) -> np.ndarray:
    """Oscurece el frame fuera de los bboxes (efecto foco)."""
    h, w = frame.shape[:2]
    dimmed = (frame.astype(np.float32) * dim_factor).astype(np.uint8)
    for x1, y1, x2, y2 in bboxes:
        x1, y1 = max(0, int(x1)), max(0, int(y1))
        x2, y2 = min(w, int(x2)), min(h, int(y2))
        dimmed[y1:y2, x1:x2] = frame[y1:y2, x1:x2]
    return dimmed


def apply_halo(frame: np.ndarray, bbox: tuple[int, int, int, int],
               bgr: tuple[int, int, int]) -> np.ndarray:
    """Glow elíptico aproximado sobre el bbox (sin máscaras de segmentación)."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = bbox
    x1, y1 = max(0, int(x1)), max(0, int(y1))
    x2, y2 = min(w, int(x2)), min(h, int(y2))
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    axes = (max(8, (x2 - x1) * 2 // 3), max(8, (y2 - y1) * 2 // 3))
    overlay = np.zeros_like(frame)
    cv2.ellipse(overlay, (cx, cy), axes, 0, 0, 360, bgr, -1)
    overlay = cv2.GaussianBlur(overlay, (0, 0), sigmaX=max(axes) / 3)
    return cv2.addWeighted(frame, 1.0, overlay, 0.55, 0)


def annotate_target(frame: np.ndarray, detections: sv.Detections,
                    target: dict[str, Any],
                    annotators: dict[str, Any] | None = None) -> np.ndarray:
    """Aplica al frame los estilos del target sobre sus detecciones.
    spotlight se aplica aparte (a nivel de escena, ver processors/tracking.py)."""
    if len(detections) == 0:
        return frame
    annotators = annotators or build_annotators(target)
    styles = target.get("styles") or ["box", "label"]

    if "halo" in styles:
        bbox = tuple(int(v) for v in detections.xyxy[0])
        frame = apply_halo(frame, bbox, hex_to_bgr(target.get("color", "")))
    for style in ("box", "ellipse", "triangle", "color", "trace"):
        if style in styles:
            frame = annotators[style].annotate(scene=frame, detections=detections)
    if "label" in styles:
        labels = [target.get("name", "")] * len(detections)
        frame = annotators["label"].annotate(scene=frame, detections=detections, labels=labels)
    return frame
