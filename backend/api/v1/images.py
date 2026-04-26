"""
Image endpoints — upload, EXIF extraction, and (Stage 5) AI analysis.

Upload pipeline:
  1. Read file bytes via UploadFile (async, non-blocking)
  2. Validate size  → 413 if too large
  3. Validate format → 422 if corrupt or unsupported
  4. Verify report exists → 404 if not
  5. Sanitise filename (UUID-based; original name stored but never used for I/O)
  6. Save via StorageProvider (swappable — local now, S3 later)
  7. Extract EXIF + determine has_exif flag
  8. Persist Image record and return ImageRead
"""

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.db.session import get_db
from backend.models.image import Image as ImageModel
from backend.models.report import Report as ReportModel
from backend.schemas.image import ImageRead
from backend.services.image_service import (
    exif_has_legal_metadata,
    extract_exif,
    validate_image_format,
    validate_image_size,
)
from backend.services.storage import LocalStorageProvider, StorageProvider

router = APIRouter()


# ── Dependency ────────────────────────────────────────────────────────────────

def get_storage() -> StorageProvider:
    """
    FastAPI dependency that supplies the active storage backend.
    Override this in tests (via app.dependency_overrides) to use a temp dir.
    Swap the return value here to switch to S3 in production.
    """
    return LocalStorageProvider(Path(settings.UPLOAD_DIR))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=ImageRead, status_code=status.HTTP_201_CREATED)
async def upload_image(
    report_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    storage: StorageProvider = Depends(get_storage),
) -> ImageRead:
    """
    Accept a multipart image upload, extract EXIF, and attach it to a report.

    The original filename is preserved in the DB for display and audit purposes
    but is never used as the on-disk path — a UUID is used instead to prevent
    path traversal and filename collision.
    """
    # 1. Read the full payload (async — does not block the event loop).
    content = await file.read()

    # 2. Size gate — reject before any further processing.
    try:
        validate_image_size(content)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc))

    # 3. Format gate — reject corrupt or unsupported files.
    try:
        fmt = validate_image_format(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # 4. Verify the target report exists.
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    # 5. Build a collision-free storage key; strip any path components from the
    #    original name so it is safe to store in the DB without path traversal risk.
    safe_original = Path(file.filename or "unknown").name
    storage_filename = f"{uuid4()}.{fmt.lower()}"

    # 6. Persist to storage backend.
    file_path = storage.save(storage_filename, content)

    # 7. Extract EXIF metadata.
    raw_exif = extract_exif(content)
    has_exif = exif_has_legal_metadata(content)

    # 8. Create the DB record.
    image = ImageModel(
        report_id=report_id,
        file_path=file_path,
        original_filename=safe_original,
        exif_data=raw_exif,
        has_exif=has_exif,
    )
    db.add(image)
    db.commit()
    db.refresh(image)

    return image


@router.post("/analyze")
async def analyze_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    """
    Submit an already-uploaded image to Claude for violation category suggestion.
    Implemented in Stage 5.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 5")


@router.get("/{image_id}", response_model=ImageRead)
def get_image_metadata(image_id: str, db: Session = Depends(get_db)) -> ImageRead:
    """Return image metadata. The original file (EXIF intact) is at file_path."""
    image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found.")
    return image
