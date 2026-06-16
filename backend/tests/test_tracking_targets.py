import numpy as np

from routers.services.processors.tracking import process_tracking


class _FakeArray(np.ndarray):
    """ndarray que expone .cpu().numpy() como un tensor de ultralytics."""
    def cpu(self):
        return self

    def numpy(self):
        return np.asarray(self)


def _tensorish(data):
    return np.asarray(data).view(_FakeArray)


class _FakeBoxes:
    def __init__(self, xyxy, conf, cls):
        self.xyxy = _tensorish(xyxy)
        self.conf = _tensorish(conf)
        self.cls = _tensorish(cls)
        self.id = None


class _FakeResult:
    """Imita la interfaz mínima de ultralytics Results para sv.Detections.from_ultralytics."""
    def __init__(self, bboxes):
        self.names = {0: "person"}
        n = len(bboxes)
        self.boxes = _FakeBoxes(
            xyxy=np.array(bboxes, dtype=np.float32),
            conf=np.array([0.9] * n, dtype=np.float32),
            cls=np.array([0] * n, dtype=np.float32),
        )
        self.obb = None
        self.masks = None


class _FakeModel:
    """Un objeto rojo moviéndose de izquierda a derecha."""
    def __init__(self, n_frames):
        self._i = 0

    def __call__(self, frame, verbose=False):
        x = 10 + self._i * 5
        self._i += 1
        return [_FakeResult([[x, 20, x + 30, 80]])]


def _frames(n=8):
    frames = []
    for i in range(n):
        f = np.zeros((120, 200, 3), dtype=np.uint8)
        x = 10 + i * 5
        f[20:80, x:x + 30] = (0, 0, 255)
        frames.append(f)
    return frames


def test_tracking_with_targets_produces_per_target_metrics():
    config = {"targets": [{
        "frame_idx": 0,
        "bbox": {"x1": 10 / 200, "y1": 20 / 120, "x2": 40 / 200, "y2": 80 / 120},
        "name": "Jugador 1",
        "color": "#ff0000",
        "styles": ["ellipse", "label", "trace"],
    }]}
    annotated, metrics = process_tracking(_frames(), _FakeModel(8), config)
    assert len(annotated) == 8
    assert "targets" in metrics
    t = metrics["targets"][0]
    assert t["name"] == "Jugador 1"
    assert t["tracked_coverage"] > 0.5
    assert t["frames_visible"] > 4
    assert "distance_px" in t
    assert "reassociations" in metrics


def test_tracking_without_targets_keeps_legacy_behavior():
    annotated, metrics = process_tracking(_frames(), _FakeModel(8), {})
    assert len(annotated) == 8
    assert "unique_tracks" in metrics
    assert "targets" not in metrics
