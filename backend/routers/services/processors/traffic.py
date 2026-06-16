from __future__ import annotations

from typing import Any

import numpy as np
import supervision as sv

from routers.services._config import (
    filter_detections,
    first_line,
    summarize_config,
)

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
