"""ORM model for complaint submissions (a report filed to an authority)."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class ComplaintSubmission(Base):
    """
    A record that a report was submitted as a complaint to a single authority.

    One row is created per (report, authority) attempt — submitting a report to
    three authorities at once produces three rows. The row is kept regardless of
    outcome (status = 'sent' | 'failed') so the dashboard can show a full audit
    trail of where and when each complaint went out.
    """

    __tablename__ = "complaint_submissions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    report_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("reports.id"), nullable=False, index=True
    )
    # Stable authority key (e.g. "POLICE") and its Hebrew label snapshotted at
    # submission time, so history stays readable even if labels change later.
    authority_key: Mapped[str] = mapped_column(String(50), nullable=False)
    authority_label: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False)

    # 'sent' or 'failed'. error_message holds the failure reason when failed.
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    submitted_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    report: Mapped["Report"] = relationship(
        "Report", back_populates="complaint_submissions"
    )
