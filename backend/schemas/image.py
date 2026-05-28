"""
Pydantic schemas for the Image resource.

The image file itself is served directly (binary response); this schema
covers only the metadata record returned alongside it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ImageRead(BaseModel):
    """Image metadata returned by the API after a successful upload."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    # None while the image is staged (uploaded before its report is created).
    report_id: Optional[str] = None
    file_path: str
    original_filename: str
    exif_data: Optional[dict[str, Any]] = None
    # True when GPS coordinates or DateTimeOriginal were found in EXIF.
    has_exif: bool
    ai_category: Optional[str] = None
    uploaded_at: datetime


class AnalysisResult(BaseModel):
    """
    Response from POST /api/v1/images/analyze.

    analysis_available distinguishes between 'AI returned a category' (True)
    and 'AI timed out or was unavailable' (False). The frontend should show
    a different message for each case so the coordinator knows whether to
    wait or to classify manually.
    """

    image_id: str
    # None while the image has not yet been linked to a report.
    report_id: Optional[str] = None
    # The suggested violation category. None when analysis was unavailable.
    ai_category: Optional[str]
    # False on timeout, API error, unsupported format, or invalid AI response.
    analysis_available: bool
