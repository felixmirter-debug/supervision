import numpy as np

from routers.services._config import (
    analysis_duration,
    analysis_segment,
    config_polygons,
    first_line,
    point_to_pixel,
    summarize_config,
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
