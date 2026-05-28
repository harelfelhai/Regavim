"""ORM model for images attached to reports."""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Image(Base):
    """
    An image file attached to a report.

    The original file is stored on disk untouched — no re-encoding, no stripping.
    exif_data holds the full EXIF blob extracted at upload time and is immutable
    after creation; it may be used as evidence in legal proceedings.

    has_exif is True only when the EXIF block contains GPS coordinates or a
    DateTimeOriginal timestamp. Device make/model alone do not qualify.
    """

    __tablename__ = "images"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # Nullable: an image is uploaded and analysed BEFORE its report exists.
    # It stays "staged" (report_id IS NULL) until the reporter submits, at which
    # point the report is created and the image is linked. Staged images that are
    # never linked are removed by the orphan-image reaper (see image_service).
    report_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("reports.id"), nullable=True
    )
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    exif_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # True only when GPS or DateTimeOriginal metadata was found — legal significance flag.
    has_exif: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # AI category suggestion, stored at analysis time so it survives until the
    # report is created (then copied onto report.ai_category).
    ai_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    report: Mapped["Report"] = relationship("Report", back_populates="images")
