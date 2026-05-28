"""
Image endpoints — upload and file serving.

Upload pipeline  (POST /upload):
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
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from backend.api.deps import get_current_user
from backend.core.config import settings
from backend.db.session import get_db
from backend.models.image import Image as ImageModel
from backend.models.report import Report as ReportModel
from backend.models.user import User
from backend.schemas.image import ImageRead
from backend.services.image_service import (
    exif_has_legal_metadata,
    extract_exif,
    validate_image_format,
    validate_image_size,
)
from backend.services.storage import (
    CloudinaryStorageProvider,
    LocalStorageProvider,
    StorageProvider,
)

router = APIRouter()

# Media type lookup by file extension — used when serving stored files.
_EXT_TO_MEDIA_TYPE: dict[str, str] = {
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
}


# ── Dependency ────────────────────────────────────────────────────────────────

def get_storage() -> StorageProvider:
    """
    FastAPI dependency that supplies the active storage backend.
    Override this in tests (via app.dependency_overrides) to use a temp dir.

    Cloudinary is activated when all three CLOUDINARY_* env vars are set.
    Falls back to local disk storage for development and CI.
    """
    if settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET:
        return CloudinaryStorageProvider(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
        )
    return LocalStorageProvider(Path(settings.UPLOAD_DIR))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=ImageRead, status_code=status.HTTP_201_CREATED)
async def upload_image(
    report_id: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    storage: StorageProvider = Depends(get_storage),
    current_user: User = Depends(get_current_user),
) -> ImageRead:
    """
    Accept a multipart image upload and extract EXIF.

    report_id is optional. The interactive create flow uploads the image WITHOUT
    a report (it is created only when the reporter submits), so the image is
    "staged" with report_id=None and linked to the report at creation time.
    When report_id IS supplied it must reference an existing report.

    The original filename is preserved in the DB for display and audit purposes
    but is never used as the on-disk path — a UUID is used instead to prevent
    path traversal and filename collision.
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

    if report_id is not None:
        report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
        if not report:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הדיווח לא נמצא.")

    safe_original = Path(file.filename or "unknown").name
    storage_filename = f"{uuid4()}.{fmt.lower()}"
    file_path = storage.save(storage_filename, content)

    raw_exif = extract_exif(content)
    has_exif = exif_has_legal_metadata(content)

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


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_staged_image(
    image_id: str,
    db: Session = Depends(get_db),
    storage: StorageProvider = Depends(get_storage),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a staged image that was never linked to a report.

    Used by the create flow to clean up immediately when the user abandons it.
    Refuses (409) to delete an image already attached to a report — those are
    evidence and must be removed via the report, not here.
    """
    image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התמונה לא נמצאה.")
    if image.report_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="לא ניתן למחוק תמונה שכבר משויכת לדיווח.",
        )
    storage.delete(image.file_path)
    db.delete(image)
    db.commit()


@router.get("/{image_id}", response_model=ImageRead)
def get_image_metadata(
    image_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImageRead:
    """Return image metadata. The original file (EXIF intact) is served by /{id}/file."""
    image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התמונה לא נמצאה.")
    return image


@router.get("/{image_id}/file")
def get_image_file(
    image_id: str,
    db: Session = Depends(get_db),
    storage: StorageProvider = Depends(get_storage),
):
    """
    Serve the original image binary (EXIF intact) for display in the browser.

    This endpoint is intentionally unauthenticated because <img src="..."> tags
    cannot send custom Authorization headers. Security relies on the image_id
    being an unguessable UUID (same model as Cloudinary's signed-URL serving,
    which redirects here when configured). Reports themselves remain
    authenticated, so leaking an image_id requires already being authenticated.

    When Cloudinary is active, issues a 302 redirect to the CDN URL so the
    binary is streamed directly from the CDN rather than proxied through
    the backend. Local dev falls back to a FileResponse.
    """
    image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התמונה לא נמצאה.")

    cdn_url = storage.public_url(image.file_path)
    if cdn_url:
        return RedirectResponse(url=cdn_url, status_code=302)

    # Local storage fallback — serve directly through the backend.
    file_path = Path(image.file_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="קובץ התמונה לא נמצא בדיסק.",
        )
    media_type = _EXT_TO_MEDIA_TYPE.get(file_path.suffix.lower(), "application/octet-stream")
    return FileResponse(path=file_path, media_type=media_type)
