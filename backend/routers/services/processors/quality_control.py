from __future__ import annotations

from typing import Any

import numpy as np
import supervision as sv

from routers.services._config import (
    filter_detections,
    summarize_config,
)


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
