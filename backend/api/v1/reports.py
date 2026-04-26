"""
Report endpoints — CRUD for field violation reports.

All business logic is delegated to backend.services.report_service (Stage 3).
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.report import ReportCreate, ReportRead, ReportUpdate

router = APIRouter()


@router.post("/", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def create_report(payload: ReportCreate, db: Session = Depends(get_db)):
    """Open a new report. Image upload is handled separately via /images/."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 3")


@router.get("/", response_model=List[ReportRead])
def list_reports(db: Session = Depends(get_db)):
    """Return all reports. Supports filtering by status, category, and bounding box (Stage 3)."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 3")


@router.get("/{report_id}", response_model=ReportRead)
def get_report(report_id: str, db: Session = Depends(get_db)):
    """Return a single report by ID."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 3")


@router.patch("/{report_id}", response_model=ReportRead)
def update_report(
    report_id: str, payload: ReportUpdate, db: Session = Depends(get_db)
):
    """Update status or final category — the core approval-flow endpoint."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 3")


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(report_id: str, db: Session = Depends(get_db)):
    """Soft-delete a report (sets status to rejected, does not remove the row)."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Stage 3")
