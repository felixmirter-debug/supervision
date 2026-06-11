"""
Service-specific frame processors.
Each function takes (frames, model, config) and returns (annotated_frames, metrics).
"""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np
import supervision as sv

from routers.services._config import (
    config_polygons,
    filter_detections,
    first_line,
    summarize_config,
)


# ── Zone Counting ─────────────────────────────────────────────────────────────

def process_zone_counting(
    frames: list[np.ndarray],
    model: Any,
    config: dict,
) -> tuple[list[np.ndarray], dict]:
    """Count objects inside configurable polygon zones."""
    raw_zones: list = config.get("zones") or []

    # Default: one zone covering the full frame
    if not raw_zones and frames:
        h, w = frames[0].shape[:2]
        raw_zones = [[[0, 0], [w, 0], [w, h], [0, h]]]

    h, w = frames[0].shape[:2] if frames else (480, 640)
    polygons = config_polygons({"zones": raw_zones}, w, h, "zones")
    polygon_zones = [sv.PolygonZone(polygon=polygon) for polygon in polygons]
    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()
    zone_annotators = [sv.PolygonZoneAnnotator(zone=z) for z in polygon_zones]
    track_entries = config.get("mode") == "entry_exit"
    tracker = sv.ByteTrack() if track_entries else None

    zone_max_counts: list[int] = [0] * len(polygon_zones)
    zone_entries: list[int] = [0] * len(polygon_zones)
    zone_exits: list[int] = [0] * len(polygon_zones)
    previous_inside: list[dict[int, bool]] = [dict() for _ in polygon_zones]
    annotated: list[np.ndarray] = []

    for frame in frames:
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        if tracker:
            detections = tracker.update_with_detections(detections)

        for i, pz in enumerate(polygon_zones):
            mask = pz.trigger(detections=detections)
            zone_max_counts[i] = max(zone_max_counts[i], int(mask.sum()))
            if track_entries and detections.tracker_id is not None:
                for tracker_id, is_inside in zip(detections.tracker_id.tolist(), mask.tolist()):
                    was_inside = previous_inside[i].get(int(tracker_id), False)
                    if is_inside and not was_inside:
                        zone_entries[i] += 1
                    if was_inside and not is_inside:
                        zone_exits[i] += 1
                    previous_inside[i][int(tracker_id)] = bool(is_inside)

        scene = frame.copy()
        scene = box_annotator.annotate(scene=scene, detections=detections)
        scene = label_annotator.annotate(scene=scene, detections=detections)
        for za in zone_annotators:
            scene = za.annotate(scene=scene)
        annotated.append(scene)

    metrics = {
        "zone_max_counts": zone_max_counts,
        "zone_entries": zone_entries,
        "zone_exits": zone_exits,
        "total_max_count": max(zone_max_counts) if zone_max_counts else 0,
        "zones_defined": len(polygon_zones),
        "frames_processed": len(frames),
        "config": summarize_config(config),
    }
    return annotated, metrics


# ── Tracking ──────────────────────────────────────────────────────────────────

def process_tracking(
    frames: list[np.ndarray],
    model: Any,
    config: dict,
) -> tuple[list[np.ndarray], dict]:
    """Multi-object tracking with ByteTrack and trace visualization."""
    tracker = sv.ByteTrack()
    trace_annotator = sv.TraceAnnotator()
    label_annotator = sv.LabelAnnotator()
    box_annotator = sv.BoxAnnotator()

    all_track_ids: set[int] = set()
    max_simultaneous = 0
    annotated: list[np.ndarray] = []

    for frame in frames:
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        detections = tracker.update_with_detections(detections)

        if detections.tracker_id is not None:
            ids = set(detections.tracker_id.tolist())
            all_track_ids.update(ids)
            max_simultaneous = max(max_simultaneous, len(ids))

        scene = frame.copy()
        scene = box_annotator.annotate(scene=scene, detections=detections)
        scene = trace_annotator.annotate(scene=scene, detections=detections)
        scene = label_annotator.annotate(scene=scene, detections=detections)
        annotated.append(scene)

    metrics = {
        "unique_tracks": len(all_track_ids),
        "max_simultaneous": max_simultaneous,
        "frames_processed": len(frames),
        "config": summarize_config(config),
    }
    return annotated, metrics


# ── PPE Detection ─────────────────────────────────────────────────────────────

# Classes the PPE model is expected to detect (adjust per actual model classes)
_PPE_VIOLATION_CLASSES = {"no-hardhat", "no-vest", "no-mask", "no_hardhat", "no_vest"}


def process_ppe_detection(
    frames: list[np.ndarray],
    model: Any,
    config: dict,
) -> tuple[list[np.ndarray], dict]:
    """PPE compliance detection — flags missing safety equipment."""
    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()

    violation_frames = 0
    total_detections = 0
    total_violations = 0
    annotated: list[np.ndarray] = []

    for frame in frames:
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)

        n_detections = len(detections)
        n_violations = 0

        if n_detections > 0 and result.names and detections.class_id is not None:
            for cls_id in detections.class_id:
                class_name = result.names.get(int(cls_id), "")
                if class_name.lower() in _PPE_VIOLATION_CLASSES:
                    n_violations += 1

        total_detections += n_detections
        total_violations += n_violations
        if n_violations > 0:
            violation_frames += 1

        scene = frame.copy()
        scene = box_annotator.annotate(scene=scene, detections=detections)
        scene = label_annotator.annotate(scene=scene, detections=detections)
        annotated.append(scene)

    compliance_rate = (
        round(1.0 - (total_violations / total_detections), 3)
        if total_detections > 0
        else 1.0
    )
    metrics = {
        "total_detections": total_detections,
        "total_violations": total_violations,
        "violation_frames": violation_frames,
        "compliance_rate": compliance_rate,
        "frames_processed": len(frames),
        "config": summarize_config(config),
    }
    return annotated, metrics


# ── Traffic Analysis ──────────────────────────────────────────────────────────

_VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle", "bicycle"}


def process_traffic(
    frames: list[np.ndarray],
    model: Any,
    config: dict,
) -> tuple[list[np.ndarray], dict]:
    """Traffic counting across a configurable line zone."""
    tracker = sv.ByteTrack()
    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()

    # Default counting line: horizontal midline
    if frames:
        h, w = frames[0].shape[:2]
        line = first_line(config, w, h)
        if line:
            start, end = line
        else:
            start, end = [0, h // 2], [w, h // 2]
    else:
        start, end = [0, 240], [640, 240]

    line_zone = sv.LineZone(
        start=sv.Point(*start),
        end=sv.Point(*end),
    )
    line_annotator = sv.LineZoneAnnotator()

    by_class: dict[str, int] = {}
    annotated: list[np.ndarray] = []

    for frame in frames:
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        detections = tracker.update_with_detections(detections)

        # Tally vehicle classes currently visible
        if result.names and detections.class_id is not None:
            for cls_id in detections.class_id:
                name = result.names.get(int(cls_id), "unknown")
                if name in _VEHICLE_CLASSES:
                    by_class[name] = by_class.get(name, 0) + 1

        line_zone.trigger(detections=detections)

        scene = frame.copy()
        scene = box_annotator.annotate(scene=scene, detections=detections)
        scene = label_annotator.annotate(scene=scene, detections=detections)
        scene = line_annotator.annotate(frame=scene, line_counter=line_zone)
        annotated.append(scene)

    metrics = {
        "vehicles_in": int(line_zone.in_count),
        "vehicles_out": int(line_zone.out_count),
        "by_class": by_class,
        "frames_processed": len(frames),
        "config": summarize_config(config),
    }
    return annotated, metrics


# ── Quality Control ───────────────────────────────────────────────────────────

def process_quality_control(
    frames: list[np.ndarray],
    model: Any,
    config: dict,
) -> tuple[list[np.ndarray], dict]:
    """Industrial defect detection with heatmap visualization."""
    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()
    heatmap_annotator = sv.HeatMapAnnotator()

    total_items = 0
    defective_items = 0
    by_defect_type: dict[str, int] = {}
    annotated: list[np.ndarray] = []

    for frame in frames:
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)

        n = len(detections)
        total_items += n

        if result.names and detections.class_id is not None:
            for cls_id in detections.class_id:
                name = result.names.get(int(cls_id), "defect")
                by_defect_type[name] = by_defect_type.get(name, 0) + 1
                defective_items += 1

        scene = frame.copy()
        scene = heatmap_annotator.annotate(scene=scene, detections=detections)
        scene = box_annotator.annotate(scene=scene, detections=detections)
        scene = label_annotator.annotate(scene=scene, detections=detections)
        annotated.append(scene)

    defect_rate = round(defective_items / total_items, 3) if total_items > 0 else 0.0
    metrics = {
        "total_items": total_items,
        "defective_items": defective_items,
        "defect_rate": defect_rate,
        "by_defect_type": by_defect_type,
        "frames_processed": len(frames),
        "config": summarize_config(config),
    }
    return annotated, metrics


# ── Dispatcher ────────────────────────────────────────────────────────────────

_PROCESSOR_MAP = {
    "zone_counting": process_zone_counting,
    "tracking": process_tracking,
    "ppe_detection": process_ppe_detection,
    "traffic": process_traffic,
    "quality_control": process_quality_control,
}


def get_processor(service: str):
    fn = _PROCESSOR_MAP.get(service)
    if fn is None:
        raise ValueError(f"No processor for service '{service}'")
    return fn
