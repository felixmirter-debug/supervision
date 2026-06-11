from types import SimpleNamespace

import numpy as np

from routers.services import _processors


def test_process_traffic_annotates_line_zone(monkeypatch):
    def fake_from_ultralytics(_result):
        return _processors.sv.Detections.empty()

    def fake_model(frame, verbose=False):
        assert verbose is False
        return [SimpleNamespace(names={})]

    monkeypatch.setattr(
        _processors.sv.Detections,
        "from_ultralytics",
        fake_from_ultralytics,
    )

    frames = [np.zeros((120, 160, 3), dtype=np.uint8)]
    annotated, metrics = _processors.process_traffic(
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
