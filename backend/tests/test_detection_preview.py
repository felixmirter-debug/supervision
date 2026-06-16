import numpy as np

from routers.services._preview import sample_detections


class _FakeArray(np.ndarray):
    """ndarray subclass exposing .cpu()/.numpy() like a torch tensor."""

    def cpu(self):
        return self

    def numpy(self):
        return np.asarray(self)


def _as_fake(arr):
    return np.asarray(arr).view(_FakeArray)


class _FakeBoxes:
    def __init__(self, xyxy, conf, cls):
        self.xyxy = _as_fake(xyxy)
        self.conf = _as_fake(conf)
        self.cls = _as_fake(cls)
        self.id = None

    def __len__(self):
        return len(self.xyxy)


class _FakeResult:
    def __init__(self):
        self.names = {0: "person"}
        self.boxes = _FakeBoxes(
            xyxy=np.array([[10, 20, 40, 80]], dtype=np.float32),
            conf=np.array([0.9], dtype=np.float32),
            cls=np.array([0], dtype=np.float32),
        )
        self.obb = None
        self.masks = None


class _FakeModel:
    def __call__(self, frame, verbose=False):
        return [_FakeResult()]


def test_sample_detections_returns_normalized_bboxes_and_crops():
    frames = [(0, np.zeros((120, 200, 3), dtype=np.uint8)) for _ in range(3)]
    out = sample_detections(frames, _FakeModel(), config={})
    assert len(out) == 3
    entry = out[0]
    assert entry["frame_idx"] == 0
    det = entry["detections"][0]
    assert det["class_name"] == "person"
    assert 0 <= det["bbox"]["x1"] < det["bbox"]["x2"] <= 1
    assert len(det["crop_b64"]) > 0
