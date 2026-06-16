import pytest
import numpy as np

from routers.services._config import (
    analysis_duration,
    analysis_segment,
    config_polygons,
    first_line,
    point_to_pixel,
    summarize_config,
    parse_targets,
    ALLOWED_TARGET_STYLES,
    MAX_TARGETS,
)


def test_point_to_pixel_converts_normalized_coordinates():
    assert point_to_pixel({"x": 0.5, "y": 0.25}, 200, 100) == (100, 25)


def test_point_to_pixel_accepts_pixel_coordinates():
    assert point_to_pixel([150, 80], 200, 100) == (150, 80)


def test_config_polygons_reads_zone_objects():
    polygons = config_polygons(
        {
            "zones": [{
                "id": "zone-1",
                "points": [
                    {"x": 0, "y": 0},
                    {"x": 1, "y": 0},
                    {"x": 1, "y": 1},
                ],
            }]
        },
        100,
        50,
        "zones",
    )

    assert len(polygons) == 1
    np.testing.assert_array_equal(polygons[0], np.array([[0, 0], [99, 0], [99, 49]], dtype=np.int32))


def test_first_line_reads_new_line_config():
    line = first_line(
        {
            "lines": [{
                "start": {"x": 0.1, "y": 0.2},
                "end": {"x": 0.9, "y": 0.8},
            }]
        },
        100,
        50,
    )

    assert line == ((10, 10), (90, 40))


def test_summarize_config_counts_shapes():
    assert summarize_config({
        "zones": [{"id": "z"}],
        "lines": [{"id": "l"}],
        "rois": [{"id": "r"}],
        "confidence": 0.4,
        "class_filter": ["person"],
        "mode": "inside",
    }) == {
        "zones": 1,
        "lines": 1,
        "rois": 1,
        "confidence": 0.4,
        "class_filter": ["person"],
        "mode": "inside",
        "analysis_segment": None,
    }


def test_analysis_segment_clamps_to_video_duration():
    assert analysis_segment(
        {"analysis_segment": {"start_sec": 2, "end_sec": 20}},
        total_duration=8,
    ) == {"start_sec": 2.0, "end_sec": 8}


def test_analysis_duration_uses_selected_segment():
    assert analysis_duration(
        {"analysis_segment": {"start_sec": 4, "end_sec": 9}},
        full_duration=30,
    ) == 5


def test_parse_targets_empty_config():
    assert parse_targets({}, 1920, 1080) == []
    assert parse_targets({"targets": None}, 1920, 1080) == []


def test_parse_targets_normalizes_and_validates():
    config = {"targets": [{
        "frame_idx": 12,
        "bbox": {"x1": 0.1, "y1": 0.2, "x2": 0.3, "y2": 0.5},
        "name": "Messi #10",
        "color": "#00ffcc",
        "styles": ["ellipse", "trace", "label"],
    }]}
    targets = parse_targets(config, 1000, 800)
    assert len(targets) == 1
    t = targets[0]
    assert t["frame_idx"] == 12
    assert t["bbox"] == (100, 160, 300, 400)  # pixeles, x1<x2, y1<y2
    assert t["name"] == "Messi #10"
    assert t["color"] == "#00ffcc"
    assert t["styles"] == ["ellipse", "trace", "label"]


def test_parse_targets_rejects_invalid():
    many = {"targets": [{"frame_idx": 0, "bbox": {"x1": 0, "y1": 0, "x2": 0.1, "y2": 0.1},
                         "name": f"t{i}", "color": "#fff", "styles": ["box"]}
                        for i in range(MAX_TARGETS + 1)]}
    with pytest.raises(ValueError, match="max"):
        parse_targets(many, 100, 100)
    bad_style = {"targets": [{"frame_idx": 0, "bbox": {"x1": 0, "y1": 0, "x2": 0.1, "y2": 0.1},
                              "name": "a", "color": "#fff", "styles": ["sparkles"]}]}
    with pytest.raises(ValueError, match="style"):
        parse_targets(bad_style, 100, 100)
    bad_bbox = {"targets": [{"frame_idx": 0, "bbox": {"x1": 0.5, "y1": 0.5, "x2": 0.5, "y2": 0.5},
                             "name": "a", "color": "#fff", "styles": ["box"]}]}
    with pytest.raises(ValueError, match="bbox"):
        parse_targets(bad_bbox, 100, 100)


def test_parse_targets_non_dict_target_raises():
    with pytest.raises(ValueError, match="object"):
        parse_targets({"targets": ["not a dict"]}, 100, 100)


def test_parse_targets_non_dict_bbox_raises():
    with pytest.raises(ValueError, match="bbox"):
        parse_targets({"targets": [{"frame_idx": 0, "bbox": [0, 0, 10, 10],
                                    "name": "a", "color": "#fff", "styles": ["box"]}]}, 100, 100)


def test_parse_targets_negative_frame_idx_clamps_to_zero():
    config = {"targets": [{
        "frame_idx": -5,
        "bbox": {"x1": 0.1, "y1": 0.1, "x2": 0.5, "y2": 0.5},
        "name": "a",
        "color": "#fff",
        "styles": ["box"],
    }]}
    targets = parse_targets(config, 100, 100)
    assert targets[0]["frame_idx"] == 0


def _bbox(x1, y1, x2, y2):
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}


def test_parse_targets_anchors_to_pixels_sorted():
    config = {"targets": [{
        "name": "Jugador",
        "color": "#ff0000",
        "styles": ["ellipse"],
        "anchors": [
            {"frame_idx": 30, "bbox": _bbox(0.5, 0.5, 0.75, 0.75)},
            {"frame_idx": 5, "bbox": _bbox(0.0, 0.0, 0.5, 0.5)},
        ],
    }]}
    [target] = parse_targets(config, 200, 100)
    assert [a["frame_idx"] for a in target["anchors"]] == [5, 30]
    assert target["anchors"][0]["bbox"] == (0, 0, 100, 50)
    assert target["frame_idx"] == 5
    assert target["bbox"] == (0, 0, 100, 50)


def test_parse_targets_legacy_single_bbox_becomes_one_anchor():
    config = {"targets": [{"frame_idx": 7, "bbox": _bbox(0.1, 0.1, 0.2, 0.2)}]}
    [target] = parse_targets(config, 100, 100)
    assert len(target["anchors"]) == 1
    assert target["anchors"][0]["frame_idx"] == 7
    assert target["bbox"] == target["anchors"][0]["bbox"]


def test_parse_targets_too_many_anchors_raises():
    anchors = [{"frame_idx": i, "bbox": _bbox(0.1, 0.1, 0.2, 0.2)} for i in range(6)]
    config = {"targets": [{"anchors": anchors}]}
    try:
        parse_targets(config, 100, 100)
        assert False, "expected ValueError"
    except ValueError as e:
        assert "anchor" in str(e).lower()


def test_parse_targets_anchor_degenerate_bbox_raises():
    config = {"targets": [{"anchors": [{"frame_idx": 0, "bbox": _bbox(0.5, 0.5, 0.5, 0.5)}]}]}
    try:
        parse_targets(config, 100, 100)
        assert False, "expected ValueError"
    except ValueError as e:
        assert "area" in str(e).lower() or "bbox" in str(e).lower()


from routers.services._config import config_lines


def test_config_lines_multiple_with_default_labels():
    config = {"lines": [
        {"label": "Puerta", "start": {"x": 0.0, "y": 0.5}, "end": {"x": 1.0, "y": 0.5}},
        {"label": "Carril", "start": {"x": 0.0, "y": 0.2}, "end": {"x": 1.0, "y": 0.2},
         "in_label": "Norte", "out_label": "Sur"},
    ]}
    lines = config_lines(config, 100, 100)
    assert len(lines) == 2
    assert lines[0]["label"] == "Puerta"
    assert lines[0]["in_label"] == "Entran"
    assert lines[0]["out_label"] == "Salen"
    assert lines[0]["start"] == (0, 50) and lines[0]["end"] == (99, 50)
    assert lines[1]["in_label"] == "Norte" and lines[1]["out_label"] == "Sur"


def test_config_lines_skips_degenerate():
    config = {"lines": [{"label": "x", "start": {"x": 0.5, "y": 0.5}, "end": {"x": 0.5, "y": 0.5}}]}
    assert config_lines(config, 100, 100) == []


def test_config_lines_empty_when_no_lines():
    assert config_lines({}, 100, 100) == []
