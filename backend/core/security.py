"""
Password hashing and JWT utilities — stdlib + bcrypt only, no cryptography dep.

Password hashing: bcrypt (direct, not via passlib wrapper).
JWT:              HMAC-SHA256 over base64url-encoded header.payload, stdlib only.
                  Chosen algorithm: HS256 (symmetric, single-service app, no PKI needed).

This avoids python-jose and passlib which both crash on this system due to a
pyo3 / cffi incompatibility in the installed `cryptography` package.
"""

from __future__ import annotations

import base64
import hashlib
import hmac as _hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt as _bcrypt
from fastapi import HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from backend.core.config import settings

# Pre-encoded constant header: {"alg":"HS256","typ":"JWT"}
_HEADER_ENC = (
    base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b"=").decode()
)

# tokenUrl is OpenAPI metadata only — the login endpoint accepts JSON, not form data.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _b64enc(data: dict) -> str:
    return (
        base64.urlsafe_b64encode(json.dumps(data, separators=(",", ":")).encode())
        .rstrip(b"=")
        .decode()
    )


def _b64dec(s: str) -> dict:
    s += "=" * (4 - len(s) % 4)  # restore padding
    return json.loads(base64.urlsafe_b64decode(s))


def _sign(message: str) -> str:
    raw = _hmac.new(
        settings.SECRET_KEY.encode(), message.encode(), hashlib.sha256
    ).digest()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


# ── Public API ────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(
    subject: str,
    role: str,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload_enc = _b64enc({"sub": subject, "role": role, "exp": int(expire.timestamp())})
    message = f"{_HEADER_ENC}.{payload_enc}"
    return f"{message}.{_sign(message)}"


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Verify signature and expiry; return the decoded payload.
    All failure modes (wrong format, bad signature, expired) raise HTTP 401
    so callers never need to catch exceptions themselves.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("invalid segment count")
        header_enc, payload_enc, sig_enc = parts
        message = f"{header_enc}.{payload_enc}"
        expected = _sign(message)
        # Constant-time comparison prevents timing attacks on the signature.
        if not _hmac.compare_digest(sig_enc, expected):
            raise ValueError("signature mismatch")
        payload = _b64dec(payload_enc)
        exp = payload.get("exp")
        if exp is not None and datetime.now(timezone.utc).timestamp() > exp:
            raise ValueError("token expired")
        return payload
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
