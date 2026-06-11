from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.auth import require_admin
from core.db import get_supabase

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class BanRequest(BaseModel):
    reason: str


class AdjustCreditsRequest(BaseModel):
    amount: int
    description: str


class ResolveClaimRequest(BaseModel):
    action: str  # 'resolved_refund' | 'resolved_no_action' | 'rejected'
    admin_notes: str
    credits_returned: int = 0


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    search: str = Query(default=""),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    admin: dict = Depends(require_admin),
):
    supabase = get_supabase()
    query = (
        supabase.table("profiles")
        .select("id, role, credits, plan, total_jobs, total_spent, banned_at, banned_reason, created_at")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    result = query.execute()
    return {"users": result.data or [], "limit": limit, "offset": offset}


@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: str,
    body: BanRequest,
    admin: dict = Depends(require_admin),
):
    supabase = get_supabase()
    result = supabase.table("profiles").update({
        "banned_at": datetime.now(timezone.utc).isoformat(),
        "banned_reason": body.reason,
        "banned_by": admin["user_id"],
    }).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@router.post("/users/{user_id}/unban")
async def unban_user(
    user_id: str,
    admin: dict = Depends(require_admin),
):
    supabase = get_supabase()
    result = supabase.table("profiles").update({
        "banned_at": None,
        "banned_reason": None,
        "banned_by": None,
    }).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@router.post("/users/{user_id}/credits")
async def adjust_credits(
    user_id: str,
    body: AdjustCreditsRequest,
    admin: dict = Depends(require_admin),
):
    if body.amount == 0:
        raise HTTPException(status_code=422, detail="Amount cannot be zero")

    supabase = get_supabase()
    profile = supabase.table("profiles").select("credits").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="User not found")

    new_balance = profile.data["credits"] + body.amount
    if new_balance < 0:
        raise HTTPException(status_code=422, detail="Credits cannot go below zero")

    supabase.table("profiles").update({"credits": new_balance}).eq("id", user_id).execute()
    supabase.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": body.amount,
        "type": "manual_adjustment",
        "description": body.description,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return {"ok": True, "new_balance": new_balance}


# ── Claims ────────────────────────────────────────────────────────────────────

@router.get("/claims")
async def list_claims(
    status: str = Query(default="open"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    admin: dict = Depends(require_admin),
):
    supabase = get_supabase()
    query = (
        supabase.table("claims")
        .select("*, jobs(service, duration_sec, credits_estimated)")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if status != "all":
        query = query.eq("status", status)
    result = query.execute()
    return {"claims": result.data or [], "limit": limit, "offset": offset}


@router.post("/claims/{claim_id}/resolve")
async def resolve_claim(
    claim_id: str,
    body: ResolveClaimRequest,
    admin: dict = Depends(require_admin),
):
    valid_actions = {"resolved_refund", "resolved_no_action", "rejected"}
    if body.action not in valid_actions:
        raise HTTPException(status_code=422, detail=f"action must be one of {valid_actions}")

    supabase = get_supabase()
    claim = supabase.table("claims").select("user_id, status").eq("id", claim_id).single().execute()
    if not claim.data:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.data["status"] != "open":
        raise HTTPException(status_code=409, detail="Claim is not open")

    if body.action == "resolved_refund" and body.credits_returned > 0:
        supabase.table("profiles").select("credits").eq("id", claim.data["user_id"]).single().execute()
        supabase.rpc("refund_credits", {
            "p_user_id": claim.data["user_id"],
            "p_job_id": None,
            "p_amount": body.credits_returned,
            "p_type": "admin_refund",
        }).execute()

    supabase.table("claims").update({
        "status": body.action,
        "admin_notes": body.admin_notes,
        "resolved_by": admin["user_id"],
        "credits_returned": body.credits_returned,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", claim_id).execute()

    return {"ok": True}


# ── Failed Jobs ───────────────────────────────────────────────────────────────

@router.get("/jobs/failed")
async def list_failed_jobs(
    limit: int = Query(default=20, le=100),
    admin: dict = Depends(require_admin),
):
    supabase = get_supabase()
    result = (
        supabase.table("jobs")
        .select("id, user_id, service, error_message, credits_estimated, created_at, completed_at")
        .eq("status", "failed")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"jobs": result.data or []}
