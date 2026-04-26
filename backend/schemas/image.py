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
    report_id: str
    file_path: str
    original_filename: str
    exif_data: Optional[dict[str, Any]] = None
    # True when GPS coordinates or DateTimeOriginal were found in EXIF.
    has_exif: bool
    uploaded_at: datetime
