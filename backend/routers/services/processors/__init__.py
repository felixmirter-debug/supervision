"""
Service-specific frame processors.
Each function takes (frames, model, config) and returns (annotated_frames, metrics).
"""
from routers.services.processors.zone_counting import process_zone_counting
from routers.services.processors.tracking import process_tracking
from routers.services.processors.ppe_detection import process_ppe_detection
from routers.services.processors.traffic import process_traffic
from routers.services.processors.quality_control import process_quality_control

_PROCESSOR_MAP = {
    "zone_counting": process_zone_counting,
    "tracking": process_tracking,
    "ppe_detection": process_ppe_detection,
    "traffic": process_traffic,
    "quality_control": process_quality_control,
}


def get_processor(service: str):
    fn = _PROCESSOR_MAP.get(service)
    if fn is None:
        raise ValueError(f"No processor for service '{service}'")
    return fn
