from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import cv2
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from core.auth import get_current_user
from core.credits import apply_reid_multiplier, estimate_cost, get_service_pricing, reserve_credits
from core.db import get_supabase
from routers.services._config import analysis_duration
from routers.services._pipeline import process_job_background

router = APIRouter()

VALID_SERVICES = {
    "zone_counting", "tracking", "ppe_detection", "traffic", "quality_control"
}

SLUG_MAP = {s.replace("_", "-"): s for s in VALID_SERVICES}


def _resolve_slug(slug: str) -> str:
    normalized = SLUG_MAP.get(slug, slug)
    if normalized not in VALID_SERVICES:
        raise HTTPException(status_code=404, detail=f"Service '{slug}' not found")
    return normalized


# ── Schemas ──────────────────────────────────────────────────────────────────

class EstimateResponse(BaseModel):
    job_id: str
    duration_sec: float
    credits_estimated: int
    credits_per_sec: float
    service: str


class ProcessRequest(BaseModel):
    job_id: str
    confirmed: bool
    processing_config: Optional[dict[str, Any]] = None
    zone_config: Optional[list] = None


class ProcessResponse(BaseModel):
    job_id: str
    status: str


class DetectionPreviewRequest(BaseModel):
    job_id: str
    sample_fps: float = 1.0
    confidence: Optional[float] = None
    class_filter: Optional[list[str]] = None


class DetectionPreviewResponse(BaseModel):
    job_id: str
    fps: float
    frames: list[dict[str, Any]]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _save_upload(file: UploadFile) -> str:
    import os, aiofiles
    os.makedirs("temp/uploads", exist_ok=True)
    ext = os.path.splitext(file.filename or "upload.mp4")[1] or ".mp4"
    dest = f"temp/uploads/{uuid.uuid4()}{ext}"
    async with aiofiles.open(dest, "wb") as f:
        content = await file.read()
        await f.write(content)
    return os.path.abspath(dest)


def _video_duration(path: str) -> float:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise HTTPException(status_code=422, detail="Cannot read video file")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    cap.release()
    return max(frames / fps, 1.0)


def _url_duration(url: str) -> float:
    cap = cv2.VideoCapture(url)
    if not cap.isOpened():
        raise HTTPException(status_code=422, detail="Cannot open video URL")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    cap.release()
    return max(frames / fps, 1.0)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{slug}/estimate", response_model=EstimateResponse)
async def estimate(
    slug: str,
    input_type: str = Form(...),
    file: Optional[UploadFile] = File(None),
    input_url: Optional[str] = Form(None),
    user: dict = Depends(get_current_user),
):
    service = _resolve_slug(slug)

    try:
        pricing = get_service_pricing(service)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Resolve video source and duration
    if input_type == "upload":
        if not file:
            raise HTTPException(status_code=422, detail="File required for input_type='upload'")
        temp_path = await _save_upload(file)
        duration = _video_duration(temp_path)
        source_ref = temp_path
    elif input_type in ("url", "webcam_sample"):
        if not input_url:
            raise HTTPException(status_code=422, detail="input_url required")
        duration = _url_duration(input_url)
        source_ref = input_url
    else:
        raise HTTPException(status_code=422, detail=f"Unknown input_type '{input_type}'")

    credits_estimated = estimate_cost(duration, float(pricing["credits_per_sec"]))

    job_id = str(uuid.uuid4())
    supabase = get_supabase()
    supabase.table("jobs").insert({
        "id": job_id,
        "user_id": user["user_id"],
        "service": service,
        "status": "estimating",
        "input_type": input_type,
        "input_url": source_ref,
        "duration_sec": round(duration, 2),
        "credits_estimated": credits_estimated,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return EstimateResponse(
        job_id=job_id,
        duration_sec=round(duration, 2),
        credits_estimated=credits_estimated,
        credits_per_sec=float(pricing["credits_per_sec"]),
        service=service,
    )


@router.post("/{slug}/process", response_model=ProcessResponse)
async def process(
    slug: str,
    body: ProcessRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    service = _resolve_slug(slug)

    if not body.confirmed:
        raise HTTPException(status_code=400, detail="confirmed must be true to start processing")

    supabase = get_supabase()
    result = (
        supabase.table("jobs")
        .select("*")
        .eq("id", body.job_id)
        .eq("user_id", user["user_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")

    job = result.data
    if job["status"] != "estimating":
        raise HTTPException(
            status_code=409,
            detail=f"Job status is '{job['status']}', expected 'estimating'",
        )

    pricing = get_service_pricing(service)
    duration = analysis_duration(body.processing_config, float(job.get("duration_sec") or 0))
    credits_estimated = estimate_cost(duration, float(pricing["credits_per_sec"]))

    has_targets = bool((body.processing_config or {}).get("targets"))
    if has_targets:
        from routers.services._config import parse_targets
        cfg = body.processing_config or {}
        try:
            parse_targets(cfg, int(cfg.get("frame_width") or 1920), int(cfg.get("frame_height") or 1080))
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
    credits_estimated = apply_reid_multiplier(credits_estimated, has_targets)

    if user["credits"] < credits_estimated:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits: need {credits_estimated}, have {user['credits']}",
        )

    try:
        reserve_credits(user["user_id"], body.job_id, credits_estimated)
    except ValueError as e:
        raise HTTPException(status_code=402, detail=str(e))

    supabase.table("jobs").update({
        "status": "processing",
        "confirmed_at": datetime.now(timezone.utc).isoformat(),
        "credits_estimated": credits_estimated,
        "processing_config": body.processing_config,
    }).eq("id", body.job_id).execute()

    background_tasks.add_task(
        process_job_background,
        job_id=body.job_id,
        service=service,
        user_id=user["user_id"],
        processing_config=body.processing_config,
        zone_config=body.zone_config,
    )

    return ProcessResponse(job_id=body.job_id, status="processing")


@router.post("/{slug}/detection-preview", response_model=DetectionPreviewResponse)
async def detection_preview(
    slug: str,
    body: DetectionPreviewRequest,
    user: dict = Depends(get_current_user),
):
    service = _resolve_slug(slug)
    if service != "tracking":
        raise HTTPException(status_code=400, detail="detection-preview only supports 'tracking'")

    supabase = get_supabase()
    result = (
        supabase.table("jobs").select("*")
        .eq("id", body.job_id).eq("user_id", user["user_id"])
        .single().execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    if result.data["status"] != "estimating":
        raise HTTPException(status_code=409, detail="Job already processed")

    from core.models import get_model
    from routers.services._preview import sample_detections, sample_frames

    sampled, fps = sample_frames(result.data["input_url"], body.sample_fps)
    if not sampled:
        raise HTTPException(status_code=422, detail="No frames decoded from input video")

    config = {"confidence": body.confidence, "class_filter": body.class_filter}
    frames = sample_detections(sampled, get_model(service), config)
    return DetectionPreviewResponse(job_id=body.job_id, fps=fps, frames=frames)
