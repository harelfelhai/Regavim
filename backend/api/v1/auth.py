"""
Authentication endpoints — register, login, and current-user lookup.

login and register are intentionally public (no Bearer token required).
me requires a valid token via get_current_user.

User enumeration mitigation: login returns the same 401 message whether the
email doesn't exist or the password is wrong, so attackers can't probe
which emails are registered.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from backend.api.deps import get_current_user
from backend.core.constants import UserRole
from backend.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from backend.db.session import get_db
from backend.models.user import User
from backend.schemas.user import LoginRequest, TokenResponse, UserCreate, UserRead

router = APIRouter()

# Optional bearer (auto_error=False) so /register stays public, but can still
# detect an authenticated admin caller to allow creating elevated-role accounts.
_optional_bearer = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def _is_admin_token(token: Optional[str], db: Session) -> bool:
    """True only if the bearer token is valid AND belongs to an admin user."""
    if not token:
        return False
    try:
        payload = decode_access_token(token)
    except HTTPException:
        return False
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    return bool(user and user.role == UserRole.ADMIN.value)


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(
    payload: UserCreate,
    token: Optional[str] = Depends(_optional_bearer),
    db: Session = Depends(get_db),
) -> UserRead:
    """
    Create a new user account. Returns 409 if the email is already taken.

    Public (unauthenticated) registration always creates a coordinator — a
    requested manager/admin role is honored ONLY when the caller is an
    authenticated admin. This prevents anyone from self-assigning admin via the
    public endpoint.
    """
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="כתובת הדוא״ל כבר רשומה במערכת.",
        )

    role = payload.role.value
    if role != UserRole.COORDINATOR.value and not _is_admin_token(token, db):
        role = UserRole.COORDINATOR.value

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """
    Verify credentials and return a signed JWT access token.
    Returns 401 for both wrong email and wrong password (prevents user enumeration).
    """
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="דוא״ל או סיסמה שגויים.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(subject=user.id, role=user.role)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)) -> UserRead:
    """Return the profile of the currently authenticated user."""
    return current_user
