from types import SimpleNamespace

import numpy as np

import supervision as sv

from routers.services.processors import process_traffic
from routers.services.processors import traffic as _traffic_module


def test_process_traffic_annotates_line_zone(monkeypatch):
    def fake_from_ultralytics(_result):
        return sv.Detections.empty()

    def fake_model(frame, verbose=False):
        assert verbose is False
        return [SimpleNamespace(names={})]

    monkeypatch.setattr(
        sv.Detections,
        "from_ultralytics",
        fake_from_ultralytics,
    )

    frames = [np.zeros((120, 160, 3), dtype=np.uint8)]
    annotated, metrics = process_traffic(
        frames=frames,
        model=fake_model,
        config={
            "lines": [{
                "start": {"x": 0.25, "y": 0.1},
                "end": {"x": 0.75, "y": 0.9},
            }]
        },
    )

    assert len(annotated) == 1
    assert annotated[0].shape == frames[0].shape
    assert metrics["frames_processed"] == 1


from routers.services.processors.zone_counting import process_zone_counting


class _TensorLike:
    """Thin wrapper that gives a plain numpy array a .cpu().numpy() interface."""
    def __init__(self, arr):
        self._arr = np.asarray(arr)

    def cpu(self):
        return self

    def numpy(self):
        return self._arr

    def astype(self, dtype):
        return self._arr.astype(dtype)

    def int(self):
        return _TensorLike(self._arr.astype(np.int64))

    def __len__(self):
        return len(self._arr)


class _MoverBoxes:
    def __init__(self, y):
        self.xyxy = _TensorLike([[90.0, float(y), 110.0, float(y + 20)]])
        self.conf = _TensorLike([0.9])
        self.cls = _TensorLike([0.0])
        self.id = None

    def __len__(self):
        return 1


class _MoverResult:
    def __init__(self, y):
        self.names = {0: "car"}
        self.boxes = _MoverBoxes(y)
        self.obb = None
        self.masks = None


class _MoverModel:
    def __init__(self):
        self._ys = iter([0, 0, 12, 24, 36, 48, 60, 72])

    def __call__(self, frame, verbose=False):
        return [_MoverResult(next(self._ys))]


def _count_frames(n):
    return [np.zeros((100, 200, 3), dtype=np.uint8) for _ in range(n)]


def test_zone_counting_line_counts_crossing_by_class():
    config = {
        "frame_width": 200, "frame_height": 100,
        "lines": [{"label": "Av", "start": {"x": 0.0, "y": 0.5}, "end": {"x": 1.0, "y": 0.5},
                   "in_label": "Bajan", "out_label": "Suben"}],
    }
    _, metrics = process_zone_counting(_count_frames(8), _MoverModel(), config)
    assert len(metrics["lines"]) == 1
    line = metrics["lines"][0]
    assert line["label"] == "Av"
    assert line["in_label"] == "Bajan" and line["out_label"] == "Suben"
    assert (line["in_total"] + line["out_total"]) >= 1
    total_by_class = {**line["by_class_in"], **line["by_class_out"]}
    assert total_by_class.get("car", 0) >= 1


def test_zone_counting_zone_reports_occupancy_series():
    config = {
        "frame_width": 200, "frame_height": 100,
        "zones": [{"id": "z1", "label": "Entrada", "points": [
            {"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 0.0}, {"x": 1.0, "y": 1.0}, {"x": 0.0, "y": 1.0}]}],
    }
    _, metrics = process_zone_counting(_count_frames(8), _MoverModel(), config)
    assert len(metrics["zones"]) == 1
    z = metrics["zones"][0]
    assert z["label"] == "Entrada"
    assert z["peak_occupancy"] >= 1
    assert "avg_occupancy" in z and "peak_at_sec" in z
