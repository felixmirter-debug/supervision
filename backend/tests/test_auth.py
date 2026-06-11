import pytest
import time
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend
import jwt as pyjwt

# Generate a test EC key pair once for all tests
_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1(), default_backend())
_PUBLIC_KEY = _PRIVATE_KEY.public_key()


def make_token(user_id: str, expired: bool = False) -> str:
    exp = time.time() - 100 if expired else time.time() + 3600
    return pyjwt.encode(
        {"sub": user_id, "aud": "authenticated", "exp": int(exp)},
        _PRIVATE_KEY,
        algorithm="ES256",
    )


def _mock_jwks(mock_get_jwks_client):
    """Configure mock JWKS client to return our test public key."""
    mock_client = MagicMock()
    mock_signing_key = MagicMock()
    mock_signing_key.key = _PUBLIC_KEY
    mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
    mock_get_jwks_client.return_value = mock_client


@patch("core.auth._get_jwks_client")
@patch("core.auth.get_supabase")
@pytest.mark.asyncio
async def test_valid_token_returns_user(mock_get_supabase, mock_get_jwks_client):
    _mock_jwks(mock_get_jwks_client)

    mock_client = MagicMock()
    mock_get_supabase.return_value = mock_client
    (
        mock_client.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
        .data
    ) = {"banned_at": None, "role": "user", "credits": 60}

    from core.auth import get_current_user

    token = make_token("user-abc")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    result = await get_current_user(creds)

    assert result["user_id"] == "user-abc"
    assert result["role"] == "user"
    assert result["credits"] == 60


@patch("core.auth._get_jwks_client")
@pytest.mark.asyncio
async def test_expired_token_raises_401(mock_get_jwks_client):
    _mock_jwks(mock_get_jwks_client)

    from core.auth import get_current_user

    token = make_token("user-abc", expired=True)
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(creds)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


@patch("core.auth._get_jwks_client")
@pytest.mark.asyncio
async def test_invalid_token_raises_401(mock_get_jwks_client):
    _mock_jwks(mock_get_jwks_client)
    # Override to raise InvalidTokenError for bad token
    mock_get_jwks_client.return_value.get_signing_key_from_jwt.side_effect = (
        pyjwt.InvalidTokenError("bad token")
    )

    from core.auth import get_current_user

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="not.a.token")

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(creds)
    assert exc_info.value.status_code == 401


@patch("core.auth._get_jwks_client")
@patch("core.auth.get_supabase")
@pytest.mark.asyncio
async def test_banned_user_raises_403(mock_get_supabase, mock_get_jwks_client):
    _mock_jwks(mock_get_jwks_client)

    mock_client = MagicMock()
    mock_get_supabase.return_value = mock_client
    (
        mock_client.table.return_value
        .select.return_value
        .eq.return_value
        .single.return_value
        .execute.return_value
        .data
    ) = {"banned_at": "2026-01-01T00:00:00Z", "role": "user", "credits": 0}

    from core.auth import get_current_user

    token = make_token("banned-user")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(creds)
    assert exc_info.value.status_code == 403
