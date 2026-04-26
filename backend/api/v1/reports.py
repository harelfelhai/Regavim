"""
Report endpoints — CRUD for field violation reports.

user_id is a placeholder constant until JWT auth is wired in Stage 7.
All business logic beyond basic DB access will move to report_service in Stage 3.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.constants import ReportStatus
from backend.db.session import get_db
from backend.models.report import Report as ReportModel
from backend.schemas.report import ReportCreate, ReportRead, ReportUpdate

router = APIRouter()

# Replaced by the authenticated user's ID once Stage 7 auth is complete.
_PLACEHOLDER_USER_ID = "00000000-0000-0000-0000-000000000001"


@router.post("/", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def create_report(payload: ReportCreate, db: Session = Depends(get_db)):
    """
    Open a new report.
    The image is uploaded and analyzed separately via POST /api/v1/images/analyze.
    """
    report = ReportModel(
        user_id=_PLACEHOLDER_USER_ID,
        status=ReportStatus.PENDING.value,
        **payload.model_dump(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/", response_model=List[ReportRead])
def list_reports(db: Session = Depends(get_db)):
    """Return all reports. Filtering by status, category, and bounding box added in Stage 6."""
    return db.query(ReportModel).all()


@router.get("/{report_id}", response_model=ReportRead)
def get_report(report_id: str, db: Session = Depends(get_db)):
    """Return a single report by ID."""
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return report


@router.patch("/{report_id}", response_model=ReportRead)
def update_report(
    report_id: str, payload: ReportUpdate, db: Session = Depends(get_db)
):
    """Update status or final category — the core approval-flow endpoint."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 6")


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(report_id: str, db: Session = Depends(get_db)):
    """Soft-delete a report (sets status to rejected, does not remove the row)."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 6")
