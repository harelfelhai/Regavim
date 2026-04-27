"""
Report endpoints — CRUD for field violation reports.

All endpoints require a valid Bearer token (get_current_user dependency).
create_report uses current_user.id instead of the former placeholder constant.

Lifecycle transitions:
  POST /         → status = pending
  PATCH /{id}    → coordinator sets final_category → auto-advances to confirmed
  DELETE /{id}   → soft-delete (status = rejected; row retained for audit)
  PATCH /{id}    → manager approval (status = approved, Stage 7+)
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.api.deps import get_current_user
from backend.core.constants import ReportStatus, ViolationCategory
from backend.db.session import get_db
from backend.models.report import Report as ReportModel
from backend.models.user import User
from backend.schemas.report import ReportCreate, ReportRead, ReportUpdate
from backend.services.report_service import apply_report_filters

router = APIRouter()


@router.post("/", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Open a new report owned by the authenticated user."""
    report = ReportModel(
        user_id=current_user.id,
        status=ReportStatus.PENDING.value,
        **payload.model_dump(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/", response_model=List[ReportRead])
def list_reports(
    status: Optional[ReportStatus] = None,
    category: Optional[ViolationCategory] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    reporter_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return reports with optional filters.

    status and category are validated against their enums — invalid values return 422.
    category matches either ai_category or final_category.
    date_from / date_to accept ISO 8601 datetime strings.
    """
    query = db.query(ReportModel)
    query = apply_report_filters(
        query,
        status=status.value if status else None,
        category=category.value if category else None,
        date_from=date_from,
        date_to=date_to,
        reporter_id=reporter_id,
    )
    return query.all()


@router.get("/{report_id}", response_model=ReportRead)
def get_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a single report by ID."""
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return report


@router.patch("/{report_id}", response_model=ReportRead)
def update_report(
    report_id: str,
    payload: ReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a report's mutable fields.

    Auto-confirmation: if final_category is being set (non-null), no explicit status
    is provided, and the current status is pending, the status is automatically
    advanced to confirmed.

    Read-only fields (ai_category, user_id, coordinates, timestamps) are excluded
    from ReportUpdate — attempting to send them returns 422.
    """
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    updates = payload.model_dump(exclude_unset=True)

    # Auto-confirm: pending → confirmed when coordinator sets final_category.
    if (
        "final_category" in updates
        and updates["final_category"] is not None
        and "status" not in updates
        and report.status == ReportStatus.PENDING.value
    ):
        updates["status"] = ReportStatus.CONFIRMED.value

    for field, value in updates.items():
        # Coerce str-enum instances to their string values for the SQLAlchemy column.
        if hasattr(value, "value"):
            value = value.value
        setattr(report, field, value)

    db.commit()
    db.refresh(report)
    return report


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Soft-delete a report by setting its status to rejected.
    The row is retained for legal audit purposes.
    """
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    report.status = ReportStatus.REJECTED.value
    db.commit()
