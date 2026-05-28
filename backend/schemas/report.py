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
    """
    Payload for POST /api/v1/reports/.

    The report is created in one atomic step when the reporter submits:
    final_category (when present) advances the report straight to 'confirmed',
    and image_id links a previously-uploaded staged image to the new report.
    """

    description: Optional[str] = None
    observed_at: Optional[datetime] = None
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
    target_lat: Optional[float] = None
    target_lng: Optional[float] = None
    land_context: Optional[str] = None
    tags: list[str] = []
    final_category: Optional[ViolationCategory] = None
    # ID of a staged image (uploaded with no report) to attach to this report.
    image_id: Optional[str] = None

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
    tags: Optional[list[str]] = None


class ReportRead(BaseModel):
    """Response schema — includes computed/AI fields set by the backend."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime
    observed_at: Optional[datetime] = None
    status: ReportStatus
    final_category: Optional[str] = None
    description: Optional[str] = None
    land_context: Optional[str] = None
    user_id: str
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
    target_lat: Optional[float] = None
    target_lng: Optional[float] = None
    tags: list[str] = []
    image_ids: list[str] = []

    @field_validator("tags", mode="before")
    @classmethod
    def coerce_null_tags(cls, v: object) -> list[str]:
        """Database NULL and empty list are both returned as []."""
        return v if isinstance(v, list) else []
