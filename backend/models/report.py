"""ORM model for field violation reports."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.constants import ReportStatus
from backend.db.base import Base


class Report(Base):
    """
    A field report documenting a suspected land-use violation.

    Location fields:
      user_lat / user_lng   — coordinator's physical GPS position at submission time
      target_lat / target_lng — map-pinned location of the violation itself

    These two locations are legally distinct and must both be stored.

    AI classification fields:
      ai_category    — raw suggestion returned by Claude (may be None if analysis failed)
      final_category — human-confirmed category; always set by the coordinator before approval
    """

    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ReportStatus.PENDING.value
    )
    ai_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    final_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Placeholder for legal land status derived from GIS layer intersection.
    # Populated asynchronously after coordinates are saved; not set by the coordinator.
    land_context: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )

    user_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    user_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_lng: Mapped[float | None] = mapped_column(Float, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="reports")
    images: Mapped[list["Image"]] = relationship(
        "Image", back_populates="report", cascade="all, delete-orphan"
    )
