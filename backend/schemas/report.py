"""
Pydantic schemas for the Report resource.

ReportCreate  — fields the coordinator supplies when opening a new report
ReportUpdate  — fields that may be changed post-creation (approval flow)
ReportRead    — full representation returned by the API
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from backend.core.constants import ReportStatus, ViolationCategory


class ReportCreate(BaseModel):
    """Payload for POST /api/v1/reports/."""

    description: Optional[str] = None
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
    target_lat: Optional[float] = None
    target_lng: Optional[float] = None
    land_context: Optional[str] = None


class ReportUpdate(BaseModel):
    """Payload for PATCH /api/v1/reports/{id} — all fields optional."""

    status: Optional[ReportStatus] = None
    final_category: Optional[ViolationCategory] = None
    description: Optional[str] = None
    land_context: Optional[str] = None


class ReportRead(BaseModel):
    """Response schema — includes computed/AI fields set by the backend."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime
    status: ReportStatus
    ai_category: Optional[str] = None
    final_category: Optional[str] = None
    description: Optional[str] = None
    land_context: Optional[str] = None
    user_id: str
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
    target_lat: Optional[float] = None
    target_lng: Optional[float] = None
