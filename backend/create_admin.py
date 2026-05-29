#!/usr/bin/env python3
"""
Admin user creation script.

Reuses the same ORM models, database session, and password-hashing logic as
the live API — there is no separate auth code path.

Usage (from repo root):
    python backend/create_admin.py --email admin@example.com --password SecurePass1!
    python backend/create_admin.py --email mgr@example.com --password SecurePass1! --role manager
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow execution as `python backend/create_admin.py` from the repo root.
sys.path.insert(0, str(Path(__file__).parent.parent))

import backend.models  # noqa: F401 — registers all ORM models with Base.metadata
from backend.core.security import hash_password
from backend.db.base import Base
from backend.db.session import SessionLocal, engine
from backend.models.user import User


def create_user(
    email: str,
    password: str,
    role: str = "admin",
    *,
    _db=None,
) -> User:
    """
    Insert a new user into the database and return the persisted object.

    Parameters
    ----------
    email, password, role:
        Standard user fields. `role` defaults to "admin" so the script is
        useful out of the box for bootstrapping a first admin account.
    _db:
        Optional SQLAlchemy session injected by tests. When omitted the
        function creates its own session from SessionLocal and closes it.
    """
    if _db is None:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        _should_close = True
    else:
        db = _db
        _should_close = False

    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise ValueError(f"A user with email '{email}' already exists.")

        user = User(
            email=email,
            hashed_password=hash_password(password),
            role=role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        if _should_close:
            db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a Regavim user account.")
    parser.add_argument("--email", required=True, help="Email address")
    parser.add_argument("--password", required=True, help="Plaintext password (hashed before storage)")
    parser.add_argument(
        "--role",
        default="admin",
        choices=["coordinator", "manager", "admin"],
        help="User role (default: admin)",
    )
    args = parser.parse_args()

    from backend.core.config import settings  # imported here to show the resolved value

    # Always print the active DATABASE_URL so the operator can confirm the script
    # and the running API server are pointing at the same database.
    print(f"  Database : {settings.DATABASE_URL}")

    try:
        user = create_user(args.email, args.password, args.role)
        print(f"✓ Created {user.role}: {user.email}  (id={user.id})")
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
