from __future__ import annotations

import base64
import os
import uuid
from typing import Any, Optional

import cv2
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from core.auth import get_current_user
from core.db import get_supabase
from core.models import get_model
from routers.services._config import analysis_segment
from routers.services._pipeline import _cleanup, _clip_video_segment
from routers.services.processors import get_processor

router = APIRouter()

JOB_SELECT = (
    "id, status, service, input_type, duration_sec, "
    "credits_estimated, credits_used, result_url, metrics, processing_config, "
    "error_message, created_at, completed_at"
)


class PreviewRequest(BaseModel):
    processing_config: Optional[dict[str, Any]] = None
    at_sec: float = Field(default=0, ge=0)
    seconds: float = Field(default=3, ge=0.1, le=10)
    sample_fps: float = Field(default=2, ge=0.5, le=8)


class ClipExportRequest(BaseModel):
    start_sec: float = Field(ge=0)
    end_sec: float = Field(gt=0)


def _encode_jpeg(frame) -> str:
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise HTTPException(status_code=500, detail="Could not encode preview frame")
    return base64.b64encode(buf).decode()


def _open_capture(source: str) -> cv2.VideoCapture:
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise HTTPException(status_code=422, detail="Cannot open video source")
    return cap


def _read_frame(source: str, at_sec: float = 0):
    cap = _open_capture(source)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        duration_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        duration_sec = duration_frames / fps if fps > 0 and duration_frames > 0 else None
        safe_at_sec = max(0.0, at_sec)
        if duration_frames > 0 and fps > 0:
            target_frame = min(
                max(0, int(round(safe_at_sec * fps))),
                max(0, int(duration_frames) - 1),
            )
            cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
            safe_at_sec = target_frame / fps
        elif safe_at_sec > 0:
            cap.set(cv2.CAP_PROP_POS_MSEC, safe_at_sec * 1000)
        ok, frame = cap.read()
        if (not ok or frame is None) and duration_frames > 1:
            cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, int(duration_frames) - 2))
            ok, frame = cap.read()
        if not ok or frame is None:
            raise HTTPException(status_code=422, detail="Cannot read video frame")
        h, w = frame.shape[:2]
        return frame, {
            "width": w,
            "height": h,
            "duration_sec": duration_sec,
            "at_sec": safe_at_sec,
        }
    finally:
        cap.release()


def _read_sample_frames(source: str, at_sec: float, seconds: float, sample_fps: float):
    cap = _open_capture(source)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        if at_sec > 0:
            cap.set(cv2.CAP_PROP_POS_MSEC, at_sec * 1000)
        step = max(1, int(round(fps / sample_fps)))
        max_frames = max(1, int(round(seconds * sample_fps)))
        frames = []
        idx = 0
        while len(frames) < max_frames:
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            if idx % step == 0:
                frames.append(frame)
            idx += 1
        if not frames:
            raise HTTPException(status_code=422, detail="Cannot read preview sample")
        return frames, fps
    finally:
        cap.release()


def _video_duration(source: str) -> float | None:
    cap = _open_capture(source)
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        if fps <= 0 or frames <= 0:
            return None
        return frames / fps
    finally:
        cap.release()


def _get_owned_job(job_id: str, user_id: str) -> dict:
    supabase = get_supabase()
    result = (
        supabase.table("jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return result.data


def _clip_response(job_id: str, source: str, start_sec: float, end_sec: float) -> FileResponse:
    if end_sec <= start_sec:
        raise HTTPException(status_code=422, detail="Clip end must be greater than start")

    os.makedirs("temp/clips", exist_ok=True)
    out_path = f"temp/clips/{uuid.uuid4()}.mp4"
    try:
        _clip_video_segment(source, out_path, start_sec, end_sec)
    except RuntimeError as exc:
        _cleanup(out_path)
        raise HTTPException(status_code=422, detail=str(exc))

    filename = f"{job_id}-{start_sec:.1f}-{end_sec:.1f}.mp4".replace(".", "_", 2)
    return FileResponse(
        out_path,
        media_type="video/mp4",
        filename=filename,
        background=BackgroundTask(_cleanup, out_path),
    )


@router.get("/{job_id}/preview-frame")
async def get_preview_frame(
    job_id: str,
    at: float = 0,
    user: dict = Depends(get_current_user),
):
    job = _get_owned_job(job_id, user["user_id"])
    source = job.get("input_url")
    if not source:
        raise HTTPException(status_code=422, detail="Job has no video source")

    frame, meta = _read_frame(source, at)
    return {
        "job_id": job_id,
        "image_base64": _encode_jpeg(frame),
        **meta,
    }


@router.post("/{job_id}/preview")
async def preview_job(
    job_id: str,
    body: PreviewRequest,
    user: dict = Depends(get_current_user),
):
    job = _get_owned_job(job_id, user["user_id"])
    source = job.get("input_url")
    if not source:
        raise HTTPException(status_code=422, detail="Job has no video source")

    service = job["service"]
    config = body.processing_config or job.get("processing_config") or {}
    duration = float(job.get("duration_sec") or 0) or _video_duration(source)
    segment = analysis_segment(config, duration)
    at_sec = body.at_sec
    seconds = body.seconds
    if segment and body.at_sec == 0:
        at_sec = segment["start_sec"]
        seconds = min(body.seconds, segment["end_sec"] - segment["start_sec"])
    frames, _fps = _read_sample_frames(source, at_sec, seconds, body.sample_fps)
    processor = get_processor(service)
    model = get_model(service)
    annotated_frames, metrics = processor(frames, model, config)
    frame = annotated_frames[0] if annotated_frames else frames[0]
    h, w = frame.shape[:2]
    return {
        "job_id": job_id,
        "image_base64": _encode_jpeg(frame),
        "width": w,
        "height": h,
        "metrics": metrics,
        "sampled_frames": len(frames),
    }


@router.get("/{job_id}/source-preview")
async def get_source_preview(job_id: str, user: dict = Depends(get_current_user)):
    job = _get_owned_job(job_id, user["user_id"])
    source = job.get("input_url")
    if not source:
        raise HTTPException(status_code=422, detail="Job has no video source")

    duration = float(job.get("duration_sec") or 0) or _video_duration(source)
    if not duration:
        raise HTTPException(status_code=422, detail="Cannot read video duration")

    return _clip_response(job_id, source, 0, duration)


@router.post("/{job_id}/export-clip")
async def export_clip(
    job_id: str,
    body: ClipExportRequest,
    user: dict = Depends(get_current_user),
):
    job = _get_owned_job(job_id, user["user_id"])
    source = job.get("input_url")
    if not source:
        raise HTTPException(status_code=422, detail="Job has no video source")

    duration = float(job.get("duration_sec") or 0) or _video_duration(source)
    config = {"analysis_segment": body.model_dump()}
    segment = analysis_segment(config, duration)
    if not segment:
        raise HTTPException(status_code=422, detail="Invalid clip segment")

    return _clip_response(job_id, source, segment["start_sec"], segment["end_sec"])


@router.get("/{job_id}")
async def get_job(job_id: str, user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("jobs")
        .select(JOB_SELECT)
        .eq("id", job_id)
        .eq("user_id", user["user_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return result.data


@router.get("/")
async def list_jobs(
    limit: int = 20,
    offset: int = 0,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("jobs")
        .select(JOB_SELECT)
        .eq("user_id", user["user_id"])
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"jobs": result.data or [], "limit": limit, "offset": offset}
