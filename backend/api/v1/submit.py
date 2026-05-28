"""
Atomic report submission endpoint.

Accepts the image file and all report metadata in a single multipart/form-data
request and completes the entire submission in one database transaction.

This is the endpoint used by the offline-capable create flow — the client
stores image + metadata locally while offline, then replays the single request
on reconnect. The original split endpoints (POST /images/upload + POST /reports/)
are kept for backward compatibility.
"""

import json
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.api.deps import get_current_user
from backend.api.v1.images import get_storage
from backend.core.constants import ReportStatus
from backend.db.session import get_db
from backend.models.image import Image as ImageModel
from backend.models.report import Report as ReportModel
from backend.models.user import User
from backend.schemas.report import ReportRead
from backend.services.image_service import (
    exif_has_legal_metadata,
    extract_exif,
    validate_image_format,
    validate_image_size,
)
from backend.services.storage import StorageProvider

router = APIRouter()


@router.post("/submit", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
async def submit_report_atomic(
    file: UploadFile = File(...),
    description: str | None = Form(default=None),
    final_category: str | None = Form(default=None),
    user_lat: float | None = Form(default=None),
    user_lng: float | None = Form(default=None),
    target_lat: float | None = Form(default=None),
    target_lng: float | None = Form(default=None),
    observed_at: str | None = Form(default=None),
    tags: str | None = Form(default=None),
    db: Session = Depends(get_db),
    storage: StorageProvider = Depends(get_storage),
    current_user: User = Depends(get_current_user),
) -> ReportRead:
    """
    Upload image and create report atomically in one multipart request.

    Unlike the two-step flow, this endpoint validates and saves the image then
    creates the linked report inside a single database transaction. Designed for
    offline-buffered clients that replay the full payload on reconnect.

    tags must be a JSON-encoded array string, e.g. '["פרשייה א"]'.
    observed_at must be an ISO 8601 string, e.g. '2024-01-01T10:00:00.000Z'.
    """
    content = await file.read()

    try:
        validate_image_size(content)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc))

    try:
        fmt = validate_image_format(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    status_value = (
        ReportStatus.CONFIRMED.value if final_category else ReportStatus.PENDING.value
    )
    if status_value == ReportStatus.CONFIRMED.value and not (
        description and description.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="נדרש תיאור כדי לאשר דיווח.",
        )

    parsed_tags = json.loads(tags) if tags else None

    parsed_observed_at = None
    if observed_at:
        try:
            parsed_observed_at = datetime.fromisoformat(
                observed_at.replace("Z", "+00:00")
            )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="פורמט תאריך לא תקין.",
            )

    safe_original = Path(file.filename or "unknown").name
    storage_filename = f"{uuid4()}.{fmt.lower()}"
    file_path = storage.save(storage_filename, content)

    raw_exif = extract_exif(content)
    has_exif = exif_has_legal_metadata(content)

    image = ImageModel(
        file_path=file_path,
        original_filename=safe_original,
        exif_data=raw_exif,
        has_exif=has_exif,
    )
    db.add(image)
    db.flush()

    report = ReportModel(
        user_id=current_user.id,
        status=status_value,
        description=description,
        final_category=final_category,
        user_lat=user_lat,
        user_lng=user_lng,
        target_lat=target_lat,
        target_lng=target_lng,
        observed_at=parsed_observed_at,
        tags=parsed_tags,
    )
    db.add(report)
    db.flush()

    image.report_id = report.id

    db.commit()
    db.refresh(report)
    return report
