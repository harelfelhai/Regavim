"""
Pydantic schemas for the Report resource.

ReportCreate  — fields the coordinator supplies when opening a new report
ReportUpdate  — fields that may be changed post-creation (approval flow)
ReportRead    — full representation returned by the API
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from backend.core.constants import ReportStatus, ViolationCategory


class ReportCreate(BaseModel):
    """Payload for POST /api/v1/reports/."""

    description: Optional[str] = None
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
    target_lat: Optional[float] = None
    target_lng: Optional[float] = None
    land_context: Optional[str] = None

    @field_validator("user_lat", "target_lat")
    @classmethod
    def validate_latitude(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (-90.0 <= v <= 90.0):
            raise ValueError(f"Latitude {v} is out of range. Must be between -90 and 90.")
        return v

    @field_validator("user_lng", "target_lng")
    @classmethod
    def validate_longitude(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not (-180.0 <= v <= 180.0):
            raise ValueError(f"Longitude {v} is out of range. Must be between -180 and 180.")
        return v


class ReportUpdate(BaseModel):
    """
    Payload for PATCH /api/v1/reports/{id} — all fields optional.
    extra='forbid' rejects unknown fields (e.g. ai_category) with 422.
    """

    model_config = ConfigDict(extra="forbid")

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
    image_ids: list[str] = []
