"""
Background processing pipeline shared by all CV services.
Reads video → runs processor → writes annotated video → uploads to storage → updates job.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import cv2

from core.credits import estimate_cost, get_service_pricing, refund_credits
from core.db import get_supabase
from core.models import get_model
from routers.services._processors import get_processor


def _read_frames(path: str, max_frames: int = 0) -> tuple[list, float, int]:
    """Returns (frames, fps, total_frame_count)."""
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames = []
    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
        if max_frames and len(frames) >= max_frames:
            break
    cap.release()
    return frames, fps, total


def _get_ffmpeg_exe() -> Optional[str]:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return shutil.which("ffmpeg")


def _write_mp4v_video(frames: list, fps: float, output_path: str) -> None:
    if not frames:
        return
    h, w = frames[0].shape[:2]
    out = cv2.VideoWriter(
        output_path,
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (w, h),
    )
    if not out.isOpened():
        raise RuntimeError("Could not open temporary video writer")
    for frame in frames:
        out.write(frame)
    out.release()


def _transcode_for_browser(input_path: str, output_path: str) -> None:
    ffmpeg = _get_ffmpeg_exe()
    if not ffmpeg:
        raise RuntimeError("FFmpeg is required to encode browser-playable result videos")

    completed = subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            input_path,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            output_path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip()[-1000:]
        raise RuntimeError(f"Could not encode browser-playable result video: {detail}")


def _write_video(frames: list, fps: float, output_path: str) -> None:
    if not frames:
        return

    raw_path = f"{os.path.splitext(output_path)[0]}-raw.mp4"
    _write_mp4v_video(frames, fps, raw_path)
    try:
        _transcode_for_browser(raw_path, output_path)
    finally:
        _cleanup(raw_path)

    if not os.path.isfile(output_path) or os.path.getsize(output_path) == 0:
        raise RuntimeError("Encoded result video was not created")


def _upload_result(job_id: str, local_path: str) -> str:
    """Uploads annotated video to Supabase Storage and returns a signed URL."""
    supabase = get_supabase()
    storage_path = f"jobs/{job_id}/result.mp4"

    with open(local_path, "rb") as f:
        supabase.storage.from_("results").upload(
            path=storage_path,
            file=f,
            file_options={"content-type": "video/mp4", "upsert": "true"},
        )

    signed = supabase.storage.from_("results").create_signed_url(
        path=storage_path,
        expires_in=60 * 60 * 24 * 7,  # 7 days
    )
    return signed.get("signedURL") or signed.get("signed_url", "")


def process_job_background(
    job_id: str,
    service: str,
    user_id: str,
    processing_config: Optional[dict[str, Any]] = None,
    zone_config: Optional[list] = None,
) -> None:
    supabase = get_supabase()

    try:
        job_result = supabase.table("jobs").select("*").eq("id", job_id).single().execute()
        if not job_result.data:
            raise RuntimeError(f"Job {job_id} not found in DB")
        job = job_result.data

        supabase.table("jobs").update({"started_at": datetime.now(timezone.utc).isoformat()}).eq("id", job_id).execute()

        # Load video
        input_path = job["input_url"]
        frames, fps, _ = _read_frames(input_path)
        if not frames:
            raise RuntimeError("No frames decoded from input video")

        # Run service-specific processor
        processor = get_processor(service)
        model = get_model(service)
        config = processing_config or job.get("processing_config") or {}
        if not config and zone_config:
            config = {"zones": zone_config}
        annotated_frames, metrics = processor(frames, model, config)

        # Write annotated video to temp
        os.makedirs("temp/results", exist_ok=True)
        out_path = f"temp/results/{uuid.uuid4()}.mp4"
        _write_video(annotated_frames, fps, out_path)

        # Upload to Supabase Storage
        result_url = _upload_result(job_id, out_path)

        # Calculate actual credits used
        actual_duration = len(frames) / fps
        pricing = get_service_pricing(service)
        credits_used = estimate_cost(actual_duration, float(pricing["credits_per_sec"]))
        credits_estimated = job["credits_estimated"]

        if credits_used < credits_estimated:
            refund_credits(user_id, job_id, credits_estimated - credits_used, "job_partial_refund")

        supabase.table("jobs").update({
            "status": "done",
            "result_url": result_url,
            "metrics": metrics,
            "credits_used": credits_used,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()

        # Clean up temp files
        _cleanup(input_path, out_path)

    except Exception as exc:
        try:
            job_result = supabase.table("jobs").select("credits_estimated").eq("id", job_id).single().execute()
            if job_result.data:
                refund_credits(user_id, job_id, job_result.data["credits_estimated"], "job_failure")
        except Exception:
            pass

        supabase.table("jobs").update({
            "status": "failed",
            "error_message": str(exc),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()


def _cleanup(*paths: str) -> None:
    for p in paths:
        try:
            if p and os.path.isfile(p):
                os.remove(p)
        except OSError:
            pass
