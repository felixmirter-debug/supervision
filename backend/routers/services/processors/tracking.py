"""Multi-object tracking. Modo automático (todo) o modo targets (objetos
seleccionados por el usuario, con Re-ID por apariencia y estilos por target)."""
from __future__ import annotations

from typing import Any

import numpy as np
import supervision as sv

from routers.services._annotators import annotate_target, apply_spotlight, build_annotators
from routers.services._config import filter_detections, parse_targets, summarize_config
from routers.services._reid import TargetMatcher, appearance_embedding


# Tracking robustness knobs.
# ByteTrack: retener tracks perdidos más tiempo y aceptar detecciones algo más
# débiles para no soltar el objeto ante oclusiones breves.
_LOST_TRACK_BUFFER = 90
_TRACK_ACTIVATION_THRESHOLD = 0.2
_MIN_MATCHING_THRESHOLD = 0.85
# Cuántos frames seguir dibujando el resaltado en la última posición conocida
# cuando el detector pierde el objeto momentáneamente.
_HOLD_FRAMES = 15


def _build_tracker() -> sv.ByteTrack:
    return sv.ByteTrack(
        track_activation_threshold=_TRACK_ACTIVATION_THRESHOLD,
        lost_track_buffer=_LOST_TRACK_BUFFER,
        minimum_matching_threshold=_MIN_MATCHING_THRESHOLD,
    )


def _single_detection(bbox: tuple[int, int, int, int], stable_id: int) -> sv.Detections:
    """Construye una Detections de un solo box con un tracker_id estable por
    target, para que cada trace por target sea continuo pese al churn de IDs."""
    return sv.Detections(
        xyxy=np.array([list(bbox)], dtype=float),
        confidence=np.array([1.0], dtype=float),
        class_id=np.array([0], dtype=int),
        tracker_id=np.array([stable_id], dtype=int),
    )


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
    tracker = _build_tracker()
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
    tracker = _build_tracker()
    matcher = TargetMatcher()
    annotators = [build_annotators(t) for t in targets]

    # Registrar embedding inicial de cada target desde su primera ancla
    for idx, target in enumerate(targets):
        first = target["anchors"][0]
        local = min(max(0, first["frame_idx"]), len(frames) - 1)
        matcher.register(idx, appearance_embedding(frames[local], first["bbox"]))

    # Mapa de anclas por frame local: {idx_local: [(target_idx, bbox), ...]}
    anchors_by_frame: dict[int, list[tuple[int, tuple[int, int, int, int]]]] = {}
    for idx, target in enumerate(targets):
        for anchor in target["anchors"]:
            local = min(max(0, anchor["frame_idx"]), len(frames) - 1)
            anchors_by_frame.setdefault(local, []).append((idx, anchor["bbox"]))

    stats = [
        {"frames_visible": 0, "held_frames": 0, "distance_px": 0.0,
         "last_center": None, "last_bbox": None, "missed": _HOLD_FRAMES + 1}
        for _ in targets
    ]
    pending_init = {i: t["anchors"][0]["bbox"] for i, t in enumerate(targets)}
    active_tracks: set[int] = set()
    annotated: list[np.ndarray] = []

    for frame_i, frame in enumerate(frames):
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        detections = tracker.update_with_detections(detections)

        current_ids = set(detections.tracker_id.tolist()) if detections.tracker_id is not None else set()
        for lost_id in active_tracks - current_ids:
            matcher.mark_lost(lost_id)
        active_tracks = current_ids

        # Re-bind dirigido por anclas en este frame
        for target_idx, anchor_bbox in anchors_by_frame.get(frame_i, []):
            best_det, best_iou = None, 0.3
            if detections.tracker_id is not None:
                for det_i, track_id in enumerate(detections.tracker_id.tolist()):
                    iou = _iou(detections.xyxy[det_i], anchor_bbox)
                    if iou > best_iou:
                        best_iou = iou
                        best_det = (det_i, int(track_id))
            if best_det is not None:
                det_i, track_id = best_det
                bbox = tuple(int(v) for v in detections.xyxy[det_i])
                matcher.bind(target_idx, track_id, bbox)
                matcher.update_embedding(target_idx, appearance_embedding(frame, bbox))
                pending_init.pop(target_idx, None)
                stats[target_idx]["missed"] = 0
                stats[target_idx]["last_bbox"] = bbox

        scene = frame.copy()
        seen: dict[int, tuple[int, int, int, int]] = {}

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

                if target_idx is None or target_idx in seen:
                    continue

                matcher.update_embedding(target_idx, appearance_embedding(frame, bbox))
                matcher.update_last_bbox(target_idx, bbox)
                seen[target_idx] = bbox

                s = stats[target_idx]
                cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
                if s["last_center"] is not None:
                    s["distance_px"] += float(((cx - s["last_center"][0]) ** 2 + (cy - s["last_center"][1]) ** 2) ** 0.5)
                s["last_center"] = (cx, cy)
                s["last_bbox"] = bbox
                s["missed"] = 0
                s["frames_visible"] += 1

        # Hold-through-gaps: mantener el resaltado en la última posición conocida
        # durante huecos cortos del detector para que el objeto no parpadee.
        render: list[tuple[int, tuple[int, int, int, int], bool]] = [
            (idx, bbox, False) for idx, bbox in seen.items()
        ]
        for target_idx, s in enumerate(stats):
            if target_idx in seen:
                continue
            s["missed"] += 1
            if s["missed"] <= _HOLD_FRAMES and s["last_bbox"] is not None:
                s["held_frames"] += 1
                render.append((target_idx, s["last_bbox"], True))

        target_boxes = [bbox for _, bbox, _ in render]
        if target_boxes and any("spotlight" in t["styles"] for t in targets):
            scene = apply_spotlight(scene, target_boxes)
        for target_idx, bbox, _held in render:
            dets = _single_detection(bbox, target_idx + 1)
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
