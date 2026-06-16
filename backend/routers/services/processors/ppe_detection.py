from __future__ import annotations

from typing import Any

import numpy as np
import supervision as sv

from routers.services._config import (
    filter_detections,
    summarize_config,
)

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
