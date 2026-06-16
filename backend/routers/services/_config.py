from __future__ import annotations

from typing import Any, Iterable, Optional

import numpy as np
import supervision as sv


Point = tuple[int, int]


def summarize_config(config: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not config:
        return {
            "zones": 0,
            "lines": 0,
            "rois": 0,
            "confidence": None,
            "class_filter": [],
            "mode": None,
            "analysis_segment": None,
        }
    return {
        "zones": len(config.get("zones") or []),
        "lines": len(config.get("lines") or []),
        "rois": len(config.get("rois") or []),
        "confidence": config.get("confidence"),
        "class_filter": config.get("class_filter") or [],
        "mode": config.get("mode"),
        "analysis_segment": analysis_segment(config),
    }


def _numeric(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def analysis_segment(
    config: Optional[dict[str, Any]],
    total_duration: Optional[float] = None,
) -> dict[str, float] | None:
    if not config:
        return None

    raw = config.get("analysis_segment") or config.get("segment")
    if not isinstance(raw, dict):
        return None

    start = max(0.0, _numeric(raw.get("start_sec"), 0.0))
    fallback_end = total_duration if total_duration and total_duration > 0 else start
    end = _numeric(raw.get("end_sec"), fallback_end)
    if total_duration and total_duration > 0:
        end = min(total_duration, end)

    if end <= start:
        return None

    return {"start_sec": start, "end_sec": end}


def analysis_duration(config: Optional[dict[str, Any]], full_duration: float) -> float:
    segment = analysis_segment(config, full_duration)
    if not segment:
        return full_duration
    return max(0.0, segment["end_sec"] - segment["start_sec"])


def point_to_pixel(raw: Any, width: int, height: int) -> Point:
    if isinstance(raw, dict):
        x = _numeric(raw.get("x"))
        y = _numeric(raw.get("y"))
    elif isinstance(raw, (list, tuple)) and len(raw) >= 2:
        x = _numeric(raw[0])
        y = _numeric(raw[1])
    else:
        x, y = 0.0, 0.0

    if 0 <= x <= 1 and 0 <= y <= 1:
        x *= width
        y *= height

    px = max(0, min(width - 1, int(round(x)))) if width > 0 else 0
    py = max(0, min(height - 1, int(round(y)))) if height > 0 else 0
    return px, py


def _raw_points(raw_shape: Any) -> Iterable[Any]:
    if isinstance(raw_shape, dict):
        return raw_shape.get("points") or []
    return raw_shape or []


def polygon_to_pixels(raw_shape: Any, width: int, height: int) -> np.ndarray:
    points = [point_to_pixel(point, width, height) for point in _raw_points(raw_shape)]
    return np.array(points, dtype=np.int32)


def config_polygons(config: dict[str, Any], width: int, height: int, key: str) -> list[np.ndarray]:
    polygons: list[np.ndarray] = []
    for raw_shape in config.get(key) or []:
        polygon = polygon_to_pixels(raw_shape, width, height)
        if len(polygon) >= 3:
            polygons.append(polygon)
    return polygons


def first_line(config: dict[str, Any], width: int, height: int) -> tuple[Point, Point] | None:
    lines = config.get("lines") or []
    if lines:
        raw = lines[0]
        if isinstance(raw, dict):
            return (
                point_to_pixel(raw.get("start"), width, height),
                point_to_pixel(raw.get("end"), width, height),
            )

    if config.get("line_start") and config.get("line_end"):
        return (
            point_to_pixel(config.get("line_start"), width, height),
            point_to_pixel(config.get("line_end"), width, height),
        )

    return None


def config_lines(config: dict[str, Any], width: int, height: int) -> list[dict[str, Any]]:
    """Devuelve todas las líneas como dicts con puntos en píxeles y etiquetas de
    dirección. Omite líneas degeneradas (start == end)."""
    out: list[dict[str, Any]] = []
    for raw in config.get("lines") or []:
        if not isinstance(raw, dict):
            continue
        start = point_to_pixel(raw.get("start"), width, height)
        end = point_to_pixel(raw.get("end"), width, height)
        if start == end:
            continue
        out.append({
            "label": str(raw.get("label") or f"Línea {len(out) + 1}"),
            "start": start,
            "end": end,
            "in_label": str(raw.get("in_label") or "Entran"),
            "out_label": str(raw.get("out_label") or "Salen"),
        })
    return out


def filter_detections(
    detections: sv.Detections,
    config: dict[str, Any],
    names: Optional[dict[int, str]],
    frame_shape: tuple[int, ...],
) -> sv.Detections:
    if len(detections) == 0:
        return detections

    mask = np.ones(len(detections), dtype=bool)

    confidence = config.get("confidence")
    if confidence is not None and detections.confidence is not None:
        mask &= detections.confidence >= float(confidence)

    class_filter = set(config.get("class_filter") or [])
    if class_filter and detections.class_id is not None and names:
        class_mask = np.array(
            [names.get(int(class_id), "") in class_filter for class_id in detections.class_id],
            dtype=bool,
        )
        mask &= class_mask

    h, w = frame_shape[:2]
    roi_polygons = config_polygons(config, w, h, "rois")
    if roi_polygons:
        roi_mask = np.zeros(len(detections), dtype=bool)
        for polygon in roi_polygons:
            roi_mask |= sv.PolygonZone(polygon=polygon).trigger(detections=detections)
        mask &= roi_mask

    return detections[mask]


# ── Tracking targets ──────────────────────────────────────────────────────────

MAX_TARGETS = 5

ALLOWED_TARGET_STYLES = {
    "box", "ellipse", "triangle", "halo", "color", "trace", "spotlight", "label",
}


MAX_ANCHORS_PER_TARGET = 5


def _parse_bbox(bbox: Any, width: int, height: int) -> tuple[int, int, int, int]:
    if not isinstance(bbox, dict):
        raise ValueError("Target bbox must be an object")
    x1, y1 = point_to_pixel({"x": bbox.get("x1"), "y": bbox.get("y1")}, width, height)
    x2, y2 = point_to_pixel({"x": bbox.get("x2"), "y": bbox.get("y2")}, width, height)
    if x2 <= x1 or y2 <= y1:
        raise ValueError("Invalid bbox: must have positive area")
    return (x1, y1, x2, y2)


def parse_targets(config: Optional[dict[str, Any]], width: int, height: int) -> list[dict[str, Any]]:
    """Valida y normaliza config['targets'] a pixeles. Lanza ValueError si es inválido."""
    raw_targets = (config or {}).get("targets") or []
    if len(raw_targets) > MAX_TARGETS:
        raise ValueError(f"Too many targets: max {MAX_TARGETS}")

    targets: list[dict[str, Any]] = []
    for raw in raw_targets:
        if not isinstance(raw, dict):
            raise ValueError("Each target must be an object")

        styles = list(raw.get("styles") or [])
        invalid = set(styles) - ALLOWED_TARGET_STYLES
        if invalid:
            raise ValueError(f"Unknown style(s): {sorted(invalid)}")

        raw_anchors = raw.get("anchors")
        if not raw_anchors:
            raw_anchors = [{"frame_idx": raw.get("frame_idx"), "bbox": raw.get("bbox")}]
        if not isinstance(raw_anchors, list):
            raise ValueError("Target anchors must be a list")
        if len(raw_anchors) > MAX_ANCHORS_PER_TARGET:
            raise ValueError(f"Too many anchors: max {MAX_ANCHORS_PER_TARGET}")

        anchors: list[dict[str, Any]] = []
        for raw_anchor in raw_anchors:
            if not isinstance(raw_anchor, dict):
                raise ValueError("Each anchor must be an object")
            anchors.append({
                "frame_idx": max(0, int(raw_anchor.get("frame_idx") or 0)),
                "bbox": _parse_bbox(raw_anchor.get("bbox"), width, height),
            })
        anchors.sort(key=lambda a: a["frame_idx"])

        targets.append({
            "anchors": anchors,
            "frame_idx": anchors[0]["frame_idx"],
            "bbox": anchors[0]["bbox"],
            "name": str(raw.get("name") or f"Objeto {len(targets) + 1}"),
            "color": str(raw.get("color") or "#00ffcc"),
            "styles": styles or ["box", "label"],
        })
    return targets
