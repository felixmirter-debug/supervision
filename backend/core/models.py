from ultralytics import YOLO
import os

_models: dict[str, YOLO] = {}

MODEL_MAP = {
    "zone_counting": "yolov8n.pt",
    "tracking": "yolov8n.pt",
    "traffic": "yolov8n.pt",
    "ppe_detection": os.getenv("PPE_MODEL_PATH", "yolov8n.pt"),
    "quality_control": os.getenv("QC_MODEL_PATH", "yolov8n.pt"),
}


def load_all_models() -> None:
    """Load all YOLO models at startup. Downloads .pt files automatically on first run."""
    for service, model_path in MODEL_MAP.items():
        print(f"  Loading model for '{service}': {model_path}")
        _models[service] = YOLO(model_path)
    print(f"✓ {len(_models)} models ready")


def get_model(service: str) -> YOLO:
    if service not in _models:
        raise RuntimeError(
            f"Model '{service}' not loaded. Ensure load_all_models() ran at startup."
        )
    return _models[service]
