"""
Authentication endpoints — register, login, and current-user lookup.

login and register are intentionally public (no Bearer token required).
me requires a valid token via get_current_user.

User enumeration mitigation: login returns the same 401 message whether the
email doesn't exist or the password is wrong, so attackers can't probe
which emails are registered.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.api.deps import get_current_user
from backend.core.security import create_access_token, hash_password, verify_password
from backend.db.session import get_db
from backend.models.user import User
from backend.schemas.user import LoginRequest, TokenResponse, UserCreate, UserRead

router = APIRouter()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> UserRead:
    """Create a new user account. Returns 409 if the email is already taken."""
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="כתובת הדוא״ל כבר רשומה במערכת.",
        )
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role.value,
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
