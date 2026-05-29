"""
Report endpoints — CRUD for field violation reports.

All endpoints require a valid Bearer token (get_current_user dependency).
create_report uses current_user.id instead of the former placeholder constant.

Lifecycle transitions:
  POST /         → status = confirmed when final_category is supplied (the
                   interactive submit), otherwise pending; links a staged image
                   when image_id is supplied. This is the first time anything is
                   persisted — the image is uploaded/analysed beforehand with no
                   report.
  PATCH /{id}    → coordinator sets final_category → auto-advances to confirmed
  PATCH /{id}    → coordinator/admin sets status = deletion_requested
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
from backend.models.image import Image as ImageModel
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
    """
    Create a report owned by the authenticated user.

    Nothing is persisted before this call — the interactive flow uploads and
    analyses the image with no report, then creates the whole record here when
    the reporter submits. When final_category is provided the report is created
    directly as 'confirmed'; when image_id is provided the staged image is
    linked and its AI suggestion copied onto the report.
    """
    data = payload.model_dump()
    image_id = data.pop("image_id", None)
    # Coerce the str-enum to its plain string value for the String column.
    if hasattr(data.get("final_category"), "value"):
        data["final_category"] = data["final_category"].value
    final_category = data.get("final_category")

    image = None
    if image_id is not None:
        image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
        if not image:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התמונה לא נמצאה.")
        if image.report_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="התמונה כבר משויכת לדיווח אחר.",
            )

    status_value = (
        ReportStatus.CONFIRMED.value if final_category else ReportStatus.PENDING.value
    )

    # A confirmed report must carry a description (same rule as PATCH).
    if status_value == ReportStatus.CONFIRMED.value and not (
        data.get("description") and data["description"].strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="נדרש תיאור כדי לאשר דיווח.",
        )

    report = ReportModel(user_id=current_user.id, status=status_value, **data)
    db.add(report)
    db.flush()  # assign report.id before linking the image

    if image is not None:
        image.report_id = report.id

    db.commit()
    db.refresh(report)
    return report


@router.get("/tags", response_model=List[str])
def list_tags(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return all distinct tags used across non-draft reports, sorted alphabetically.
    Pass ?q=partial to filter suggestions for autocomplete.
    """
    reports = db.query(ReportModel.tags).filter(
        ReportModel.status != ReportStatus.DRAFT.value,
        ReportModel.tags.isnot(None),
    ).all()

    tags: set[str] = set()
    for (row_tags,) in reports:
        if isinstance(row_tags, list):
            tags.update(row_tags)

    if q:
        q_lower = q.lower()
        tags = {t for t in tags if q_lower in t.lower()}

    return sorted(tags)


@router.get("/", response_model=List[ReportRead])
def list_reports(
    status: Optional[ReportStatus] = None,
    category: Optional[ViolationCategory] = None,
    tag: Optional[str] = None,
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
    tag filters to reports that contain the exact tag string.
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
    rows = query.all()
    if tag:
        rows = [r for r in rows if isinstance(r.tags, list) and tag in r.tags]
    return rows


@router.get("/{report_id}", response_model=ReportRead)
def get_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a single report by ID."""
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הדיווח לא נמצא.")
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הדיווח לא נמצא.")

    updates = payload.model_dump(exclude_unset=True)

    # Prevent requesting deletion for reports that are already in a terminal state.
    incoming_status = updates.get("status")
    incoming_status_value = incoming_status.value if hasattr(incoming_status, "value") else incoming_status
    if incoming_status_value == ReportStatus.DELETION_REQUESTED.value and report.status in (
        ReportStatus.APPROVED.value,
        ReportStatus.REJECTED.value,
        ReportStatus.DELETION_REQUESTED.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="לא ניתן לבקש מחיקה לדיווח שכבר אושר, נדחה או ממתין למחיקה.",
        )

    # Auto-confirm: pending → confirmed when coordinator sets final_category.
    if (
        "final_category" in updates
        and updates["final_category"] is not None
        and "status" not in updates
        and report.status == ReportStatus.PENDING.value
    ):
        updates["status"] = ReportStatus.CONFIRMED.value

    # Require a non-empty description before a report can be confirmed.
    if updates.get("status") == ReportStatus.CONFIRMED:
        effective_description = updates.get("description") or report.description
        if not (effective_description and effective_description.strip()):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="נדרש תיאור כדי לאשר דיווח.",
            )

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
    Soft-delete a report (status → rejected). The row is retained for audit.
    """
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הדיווח לא נמצא.")

    report.status = ReportStatus.REJECTED.value
    db.commit()
