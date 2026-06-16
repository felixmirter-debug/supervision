from __future__ import annotations

from typing import Any

import numpy as np
import supervision as sv

from routers.services._config import (
    config_lines,
    config_polygons,
    filter_detections,
    summarize_config,
)

_DEFAULT_FPS = 30.0


def process_zone_counting(
    frames: list[np.ndarray],
    model: Any,
    config: dict,
) -> tuple[list[np.ndarray], dict]:
    """Conteo de objetos: cruces por línea (clase/dirección) + ocupación por zona."""
    h, w = frames[0].shape[:2] if frames else (480, 640)

    raw_zones: list = config.get("zones") or []
    if not raw_zones and not config.get("lines"):
        raw_zones = [[[0, 0], [w, 0], [w, h], [0, h]]]

    polygons = config_polygons({"zones": raw_zones}, w, h, "zones")
    polygon_zones = [sv.PolygonZone(polygon=p) for p in polygons]
    zone_annotators = [sv.PolygonZoneAnnotator(zone=z) for z in polygon_zones]
    zone_labels: list[str] = []
    for i in range(len(polygon_zones)):
        raw = raw_zones[i] if i < len(raw_zones) else None
        label = raw.get("label") if isinstance(raw, dict) else None
        zone_labels.append(str(label or f"Zona {i + 1}"))

    lines = config_lines(config, w, h)
    line_zones = [sv.LineZone(start=sv.Point(*ln["start"]), end=sv.Point(*ln["end"])) for ln in lines]
    line_annotator = sv.LineZoneAnnotator()

    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()
    tracker = sv.ByteTrack()  # LineZone requiere tracker_id

    track_entries = config.get("mode") == "entry_exit"
    zone_series: list[list[int]] = [[] for _ in polygon_zones]
    zone_entries = [0] * len(polygon_zones)
    zone_exits = [0] * len(polygon_zones)
    previous_inside: list[dict[int, bool]] = [dict() for _ in polygon_zones]
    annotated: list[np.ndarray] = []

    for frame in frames:
        result = model(frame, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = filter_detections(detections, config, result.names, frame.shape)
        detections = tracker.update_with_detections(detections)

        for lz in line_zones:
            lz.trigger(detections=detections)

        for i, pz in enumerate(polygon_zones):
            mask = pz.trigger(detections=detections)
            zone_series[i].append(int(mask.sum()))
            if track_entries and detections.tracker_id is not None:
                for tracker_id, inside in zip(detections.tracker_id.tolist(), mask.tolist()):
                    was = previous_inside[i].get(int(tracker_id), False)
                    if inside and not was:
                        zone_entries[i] += 1
                    if was and not inside:
                        zone_exits[i] += 1
                    previous_inside[i][int(tracker_id)] = bool(inside)

        scene = frame.copy()
        scene = box_annotator.annotate(scene=scene, detections=detections)
        scene = label_annotator.annotate(scene=scene, detections=detections)
        for za in zone_annotators:
            scene = za.annotate(scene=scene)
        for lz in line_zones:
            scene = line_annotator.annotate(frame=scene, line_counter=lz)
        annotated.append(scene)

    fps = _DEFAULT_FPS
    line_metrics = []
    for ln, lz in zip(lines, line_zones):
        line_metrics.append({
            "label": ln["label"],
            "in_label": ln["in_label"],
            "out_label": ln["out_label"],
            "in_total": int(lz.in_count),
            "out_total": int(lz.out_count),
            "by_class_in": _by_class(lz.in_count_per_class, lz.class_id_to_name),
            "by_class_out": _by_class(lz.out_count_per_class, lz.class_id_to_name),
        })

    zone_metrics = []
    for i, series in enumerate(zone_series):
        peak = max(series) if series else 0
        peak_idx = series.index(peak) if series else 0
        zone_metrics.append({
            "label": zone_labels[i],
            "max_count": peak,
            "peak_occupancy": peak,
            "peak_at_sec": round(peak_idx / fps, 2),
            "avg_occupancy": round(sum(series) / len(series), 2) if series else 0.0,
            "entries": zone_entries[i],
            "exits": zone_exits[i],
        })

    metrics = {
        "lines": line_metrics,
        "zones": zone_metrics,
        "frames_processed": len(frames),
        "config": summarize_config(config),
    }
    return annotated, metrics


def _by_class(per_class: dict, id_to_name: dict) -> dict[str, int]:
    out: dict[str, int] = {}
    for class_id, count in (per_class or {}).items():
        name = (id_to_name or {}).get(class_id, str(class_id))
        out[name] = out.get(name, 0) + int(count)
    return out
