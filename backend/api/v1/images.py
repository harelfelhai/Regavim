"""
Image endpoints — upload, EXIF extraction, and AI analysis.

Stage 4: image upload + EXIF handling (image_service)
Stage 5: AI category suggestion (ai_service)
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.image import ImageRead

router = APIRouter()


@router.post("/analyze")
async def analyze_image(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Accept an image upload, store it with EXIF intact, and return
    a Claude-suggested violation category for human review.
    """
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 4/5")


@router.get("/{image_id}", response_model=ImageRead)
def get_image_metadata(image_id: str, db: Session = Depends(get_db)):
    """Return image metadata. The original file (EXIF intact) is served from file_path."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 4")
