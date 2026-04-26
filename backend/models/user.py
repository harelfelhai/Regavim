"""ORM model for application users."""

import uuid

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.constants import UserRole
from backend.db.base import Base


class User(Base):
    """
    Represents an application user.

    Roles:
      - coordinator: field worker who submits reports
      - manager:     reviews and approves/rejects reports
      - admin:       full system access
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default=UserRole.COORDINATOR.value
    )

    reports: Mapped[list["Report"]] = relationship("Report", back_populates="user")
