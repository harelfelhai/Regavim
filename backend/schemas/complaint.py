"""Pydantic schemas for the complaint-submission feature."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ComplaintAuthorityRead(BaseModel):
    """One selectable authority for the recipient checkboxes."""

    key: str
    label: str
    available: bool  # False when no recipient email is configured


class ComplaintSubmitRequest(BaseModel):
    """Payload for POST /api/v1/reports/{id}/complaints."""

    model_config = ConfigDict(extra="forbid")

    authorities: list[str]


class ComplaintSubmissionRead(BaseModel):
    """A single historical submission row."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    authority_key: str
    authority_label: str
    recipient_email: str
    status: str
    error_message: Optional[str] = None
    created_at: datetime


class ComplaintSubmitResultItem(BaseModel):
    authority_key: str
    authority_label: str
    status: str  # 'sent' | 'failed'
    error_message: Optional[str] = None


class ComplaintSubmitResult(BaseModel):
    """Per-authority outcome returned by the submit endpoint."""

    results: list[ComplaintSubmitResultItem]
