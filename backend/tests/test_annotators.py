import numpy as np
import supervision as sv

from routers.services._annotators import annotate_target, apply_spotlight, hex_to_bgr


def _detections(bbox=(10, 10, 50, 80), tid=1):
    return sv.Detections(
        xyxy=np.array([bbox], dtype=np.float32),
        class_id=np.array([0]),
        confidence=np.array([0.9], dtype=np.float32),
        tracker_id=np.array([tid]),
    )


def test_hex_to_bgr():
    assert hex_to_bgr("#ff0000") == (0, 0, 255)
    assert hex_to_bgr("#00ffcc") == (204, 255, 0)
    assert hex_to_bgr("invalid") == (204, 255, 0)  # fallback


def test_annotate_target_all_styles_run_without_error():
    frame = np.zeros((120, 120, 3), dtype=np.uint8)
    dets = _detections()
    for style in ["box", "ellipse", "triangle", "halo", "color", "trace", "label"]:
        target = {"name": "Test", "color": "#ff0000", "styles": [style]}
        out = annotate_target(frame.copy(), dets, target)
        assert out.shape == frame.shape


def test_spotlight_darkens_outside_bbox():
    frame = np.full((100, 100, 3), 200, dtype=np.uint8)
    out = apply_spotlight(frame, [(20, 20, 60, 60)])
    assert out[0, 0, 0] < 200      # fuera: oscurecido
    assert out[40, 40, 0] == 200   # dentro: intacto


def test_spotlight_clamps_out_of_frame_bbox():
    frame = np.full((100, 100, 3), 200, dtype=np.uint8)
    out = apply_spotlight(frame, [(-5, -5, 50, 50)])
    assert out[40, 40, 0] == 200   # interior preservado pese a coords negativas
    assert out[80, 80, 0] < 200
