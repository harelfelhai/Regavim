"""
Shared FastAPI dependencies.

get_current_user is the primary auth gate: it extracts the Bearer token,
verifies it, and returns the authenticated User ORM object. Any route that
depends on it will automatically return 401 if the token is missing or invalid.
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.security import decode_access_token, oauth2_scheme
from backend.db.session import get_db
from backend.models.user import User


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_access_token(token)
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="טוקן לא תקין",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="המשתמש לא נמצא",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
