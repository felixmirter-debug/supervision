"""Multi-object tracking. Modo automático (todo) o modo targets (objetos
seleccionados por el usuario, con Re-ID por apariencia y estilos por target)."""
from __future__ import annotations

from typing import Any

import numpy as np
import supervision as sv

from routers.services._annotators import annotate_target, apply_spotlight, build_annotators
from routers.services._config import filter_detections, parse_targets, summarize_config
from routers.services._reid import TargetMatcher, appearance_embedding


def _iou(a: np.ndarray, b: tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return float(inter / union) if union > 0 else 0.0


def process_tracking(frames: list[np.ndarray], model: Any, config: dict) -> tuple[list[np.ndarray], dict]:
    h, w = frames[0].shape[:2] if frames else (480, 640)
    targets = parse_targets(config, w, h)
    if targets:
        return _process_with_targets(frames, model, config, targets)
    return _process_legacy(frames, model, config)


def _process_legacy(
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


def _process_with_targets(frames, model, config, targets):
    h, w = frames[0].shape[:2]
    frame_diag = float((w ** 2 + h ** 2) ** 0.5)
    tracker = sv.ByteTrack()
    matcher = TargetMatcher()
    annotators = [build_annotators(t) for t in targets]

    # Registrar embedding inicial de cada target desde su frame de selección
    for idx, target in enumerate(targets):
        ref_frame = frames[min(target["frame_idx"], len(frames) - 1)]
        matcher.register(idx, appearance_embedding(ref_frame, target["bbox"]))

    stats = [{"frames_visible": 0, "distance_px": 0.0, "last_center": None} for _ in targets]
    pending_init = {i: t["bbox"] for i, t in enumerate(targets)}
    active_tracks: set[int] = set()
    annotated: list[np.ndarray] = []

    for frame in frames:
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        detections = tracker.update_with_detections(detections)

        current_ids = set(detections.tracker_id.tolist()) if detections.tracker_id is not None else set()
        for lost_id in active_tracks - current_ids:
            matcher.mark_lost(lost_id)
        active_tracks = current_ids

        target_boxes: list[tuple[int, int, int, int]] = []
        scene = frame.copy()
        per_target_detections: dict[int, sv.Detections] = {}

        if detections.tracker_id is not None:
            for det_i, track_id in enumerate(detections.tracker_id.tolist()):
                bbox = tuple(int(v) for v in detections.xyxy[det_i])
                target_idx = matcher.target_for_track(int(track_id))

                # Asociación inicial por IoU con el bbox clicado
                if target_idx is None and pending_init:
                    for cand_idx, init_bbox in list(pending_init.items()):
                        if _iou(detections.xyxy[det_i], init_bbox) > 0.3:
                            matcher.bind(cand_idx, int(track_id), bbox)
                            pending_init.pop(cand_idx)
                            target_idx = cand_idx
                            break

                # Re-ID de tracks nuevos contra targets perdidos
                if target_idx is None:
                    emb = appearance_embedding(frame, bbox)
                    target_idx = matcher.match_new_track(emb, bbox, int(track_id), frame_diag)

                if target_idx is None:
                    continue

                matcher.update_embedding(target_idx, appearance_embedding(frame, bbox))
                matcher.update_last_bbox(target_idx, bbox)
                per_target_detections[target_idx] = detections[det_i:det_i + 1]
                target_boxes.append(bbox)

                s = stats[target_idx]
                cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
                if s["last_center"] is not None:
                    s["distance_px"] += float(((cx - s["last_center"][0]) ** 2 + (cy - s["last_center"][1]) ** 2) ** 0.5)
                s["last_center"] = (cx, cy)
                s["frames_visible"] += 1

        if target_boxes and any("spotlight" in t["styles"] for t in targets):
            scene = apply_spotlight(scene, target_boxes)
        for target_idx, dets in per_target_detections.items():
            scene = annotate_target(scene, dets, targets[target_idx], annotators[target_idx])
        annotated.append(scene)

    n = max(1, len(frames))
    metrics = {
        "frames_processed": len(frames),
        "config": summarize_config(config),
        "reassociations": matcher.reassociations,
        "targets": [
            {
                "name": t["name"],
                "color": t["color"],
                "styles": t["styles"],
                "frames_visible": s["frames_visible"],
                "tracked_coverage": round(s["frames_visible"] / n, 3),
                "distance_px": round(s["distance_px"], 1),
            }
            for t, s in zip(targets, stats)
        ],
    }
    return annotated, metrics
