import os
import time
from unittest.mock import patch, MagicMock
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend
import jwt as pyjwt

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SECRET_KEY", "test-key")

import pytest
from fastapi.testclient import TestClient

# Shared test EC key pair
_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1(), default_backend())
_PUBLIC_KEY = _PRIVATE_KEY.public_key()


def auth_header(user_id: str = "user-123") -> dict:
    token = pyjwt.encode(
        {"sub": user_id, "aud": "authenticated", "exp": int(time.time() + 3600)},
        _PRIVATE_KEY,
        algorithm="ES256",
    )
    return {"Authorization": f"Bearer {token}"}


def _mock_jwks(mock_get_jwks_client):
    mock_client = MagicMock()
    mock_signing_key = MagicMock()
    mock_signing_key.key = _PUBLIC_KEY
    mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
    mock_get_jwks_client.return_value = mock_client


def _mock_profile(mock_supabase):
    (
        mock_supabase.return_value
        .table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
        .data
    ) = {"banned_at": None, "role": "user", "credits": 60}


@patch("core.auth._get_jwks_client")
@patch("core.auth.get_supabase")
@patch("routers.jobs.get_supabase")
def test_get_job_returns_job(mock_db, mock_auth_supabase, mock_jwks):
    _mock_jwks(mock_jwks)
    _mock_profile(mock_auth_supabase)

    job_data = {
        "id": "job-xyz",
        "status": "done",
        "service": "zone_counting",
        "input_type": "upload",
        "duration_sec": 30.0,
        "credits_estimated": 15,
        "credits_used": 15,
        "result_url": "https://example.com/result.mp4",
        "metrics": {"count": 5},
        "error_message": None,
        "created_at": "2026-06-10T00:00:00Z",
        "completed_at": "2026-06-10T00:00:35Z",
    }
    (
        mock_db.return_value
        .table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
        .data
    ) = job_data

    from main import app
    client = TestClient(app)
    response = client.get("/jobs/job-xyz", headers=auth_header())

    assert response.status_code == 200
    assert response.json()["id"] == "job-xyz"
    assert response.json()["status"] == "done"


@patch("core.auth._get_jwks_client")
@patch("core.auth.get_supabase")
@patch("routers.jobs.get_supabase")
def test_get_job_not_found_returns_404(mock_db, mock_auth_supabase, mock_jwks):
    _mock_jwks(mock_jwks)
    _mock_profile(mock_auth_supabase)

    (
        mock_db.return_value
        .table.return_value
        .select.return_value
        .eq.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
        .data
    ) = None

    from main import app
    client = TestClient(app)
    response = client.get("/jobs/nonexistent", headers=auth_header())

    assert response.status_code == 404


def test_get_job_without_auth_returns_401():
    from main import app
    client = TestClient(app)
    response = client.get("/jobs/any-id")
    assert response.status_code in (401, 403)
