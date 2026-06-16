from __future__ import annotations

from typing import Any

import numpy as np
import supervision as sv

from routers.services._config import (
    config_polygons,
    filter_detections,
    summarize_config,
)


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
