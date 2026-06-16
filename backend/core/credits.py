import math
from core.db import get_supabase


def estimate_cost(duration_sec: float, credits_per_sec: float) -> int:
    """Returns ceiling of duration * rate. Pure function, no DB access."""
    return math.ceil(duration_sec * credits_per_sec)


# Recargo por Re-ID de apariencia en tracking interactivo.
# Ajustar tras medir costos reales de cómputo en Modal.
REID_COST_MULTIPLIER = 1.3


def apply_reid_multiplier(credits: int, has_targets: bool) -> int:
    if not has_targets:
        return credits
    return int(round(credits * REID_COST_MULTIPLIER))


def get_service_pricing(service: str) -> dict:
    """Fetch pricing for a service from DB. Raises ValueError if not found/inactive."""
    supabase = get_supabase()
    result = (
        supabase.table("service_pricing")
        .select("service, credits_per_sec, label, description")
        .eq("service", service)
        .eq("active", True)
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError(f"Service '{service}' not found or inactive")
    return result.data


def reserve_credits(user_id: str, job_id: str, amount: int) -> None:
    """Atomically deducts credits via RPC. Raises ValueError if insufficient."""
    supabase = get_supabase()
    result = supabase.rpc(
        "reserve_credits",
        {"p_user_id": user_id, "p_job_id": job_id, "p_amount": amount},
    ).execute()
    if result.data is False:
        raise ValueError("Insufficient credits")


def refund_credits(
    user_id: str,
    job_id: str,
    amount: int,
    reason: str = "job_refund",
) -> None:
    """Returns credits to user. Used on failure or partial completion."""
    supabase = get_supabase()
    supabase.rpc(
        "refund_credits",
        {
            "p_user_id": user_id,
            "p_job_id": job_id,
            "p_amount": amount,
            "p_type": reason,
        },
    ).execute()
