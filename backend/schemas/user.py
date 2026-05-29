"""Pydantic schemas for the User resource and auth flows."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from backend.core.constants import UserRole


class UserCreate(BaseModel):
    """Payload for POST /api/v1/auth/register."""

    email: str
    password: str
    role: UserRole = UserRole.COORDINATOR


class LoginRequest(BaseModel):
    """Payload for POST /api/v1/auth/login."""

    email: str
    password: str


class TokenResponse(BaseModel):
    """Returned by POST /api/v1/auth/login on success."""

    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    """Public user representation — never exposes hashed_password."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: str
