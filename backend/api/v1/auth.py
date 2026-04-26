"""
Authentication endpoints — JWT login, refresh, and current-user lookup.
Full implementation in Stage 7.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db.session import get_db

router = APIRouter()


@router.post("/login")
def login(db: Session = Depends(get_db)):
    """Exchange email + password for a JWT access token."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 7")


@router.post("/refresh")
def refresh_token():
    """Issue a new access token given a valid refresh token."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 7")


@router.get("/me")
def get_me(db: Session = Depends(get_db)):
    """Return the currently authenticated user's profile."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 7")
