"""
WebSocket endpoint for real-time webcam processing.
Client sends base64-encoded JPEG frames; server replies with annotated frame + metrics.
Credits are deducted every 10 seconds of active streaming.
"""
from __future__ import annotations

import base64
import time
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from core.credits import estimate_cost, get_service_pricing
from core.db import get_supabase
from core.models import get_model
from routers.services.processors import get_processor

router = APIRouter()

BILLING_INTERVAL_SEC = 10
VALID_SERVICES = {
    "zone_counting", "tracking", "ppe_detection", "traffic", "quality_control"
}


def _decode_frame(b64: str) -> Optional[np.ndarray]:
    try:
        data = base64.b64decode(b64)
        arr = np.frombuffer(data, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _encode_frame(frame: np.ndarray) -> str:
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buf).decode()


def _deduct_credits(user_id: str, amount: int) -> bool:
    """Returns False if user has insufficient credits."""
    supabase = get_supabase()
    result = (
        supabase.table("profiles")
        .select("credits")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not result.data or result.data["credits"] < amount:
        return False

    # Direct update since streams do not have a job reservation lifecycle.
    supabase.table("profiles").update(
        {"credits": result.data["credits"] - amount}
    ).eq("id", user_id).execute()
    supabase.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": -amount,
        "type": "job_reserve",
        "description": "Live stream processing interval",
    }).execute()
    return True


@router.websocket("/{slug}")
async def stream(slug: str, websocket: WebSocket):
    service = slug.replace("-", "_")
    if service not in VALID_SERVICES:
        await websocket.close(code=4004, reason=f"Unknown service '{slug}'")
        return

    # Expect first message to be auth token
    await websocket.accept()
    try:
        auth_msg = await websocket.receive_json()
    except Exception:
        await websocket.close(code=4001, reason="Expected auth message")
        return

    token = auth_msg.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
    processing_config = auth_msg.get("processing_config") or {}

    # Verify JWT
    from core.auth import _get_jwks_client
    from jwt import decode as jwt_decode, ExpiredSignatureError, InvalidTokenError

    try:
        jwks = _get_jwks_client()
        signing_key = jwks.get_signing_key_from_jwt(token)
        payload = jwt_decode(token, signing_key.key, algorithms=["ES256", "HS256"], audience="authenticated")
        user_id = payload["sub"]
    except (ExpiredSignatureError, InvalidTokenError, KeyError):
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    supabase = get_supabase()
    profile = supabase.table("profiles").select("banned_at, credits").eq("id", user_id).single().execute()
    if not profile.data or profile.data.get("banned_at"):
        await websocket.close(code=4003, reason="Account suspended")
        return

    try:
        pricing = get_service_pricing(service)
    except ValueError:
        await websocket.close(code=4004, reason=f"Service '{service}' inactive")
        return

    credits_per_interval = estimate_cost(BILLING_INTERVAL_SEC, float(pricing["credits_per_sec"]))
    model = get_model(service)
    processor = get_processor(service)

    last_billed = time.monotonic()

    try:
        while websocket.client_state == WebSocketState.CONNECTED:
            msg = await websocket.receive_json()
            frame_b64 = msg.get("frame")
            frame_config = msg.get("processing_config") or processing_config
            if not frame_b64:
                continue

            frame = _decode_frame(frame_b64)
            if frame is None:
                await websocket.send_json({"error": "Invalid frame"})
                continue

            # Billing tick
            now = time.monotonic()
            if now - last_billed >= BILLING_INTERVAL_SEC:
                ok = _deduct_credits(user_id, credits_per_interval)
                if not ok:
                    await websocket.send_json({"error": "insufficient_credits"})
                    await websocket.close(code=4002, reason="Insufficient credits")
                    return
                last_billed = now

            # Process single frame
            annotated_frames, metrics = processor([frame], model, frame_config)
            out_b64 = _encode_frame(annotated_frames[0]) if annotated_frames else frame_b64

            await websocket.send_json({"frame": out_b64, "metrics": metrics})

    except WebSocketDisconnect:
        pass
