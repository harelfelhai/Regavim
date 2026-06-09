"""
Complaint endpoints — file a report to authorities by email and view history.

Registered at prefix /api/v1, so the routes resolve to:
  GET  /api/v1/complaints/authorities            — list selectable authorities
  POST /api/v1/reports/{report_id}/complaints    — submit (admin/manager only)
  GET  /api/v1/reports/{report_id}/complaints    — submission history

Submission is synchronous and isolated per authority: a failed email for one
authority is recorded as 'failed' and does not abort the others.
"""

import mimetypes

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.api.deps import get_current_user
from backend.api.v1.images import get_storage
from backend.core.constants import ReportStatus, UserRole
from backend.db.session import get_db
from backend.models.complaint import ComplaintSubmission
from backend.models.report import Report as ReportModel
from backend.models.user import User
from backend.schemas.complaint import (
    ComplaintAuthorityRead,
    ComplaintSubmissionRead,
    ComplaintSubmitRequest,
    ComplaintSubmitResult,
    ComplaintSubmitResultItem,
)
from backend.services import complaint_recipients
from backend.services.complaint_template import render_complaint
from backend.services.email_service import Attachment, send_email
from backend.services.storage import StorageProvider

router = APIRouter()

# Filing a complaint is an official action — coordinators cannot do it.
_SUBMIT_ROLES = {UserRole.ADMIN.value, UserRole.MANAGER.value}
# Only validated reports may be filed.
_ELIGIBLE_STATUSES = {ReportStatus.CONFIRMED.value, ReportStatus.APPROVED.value}


@router.get("/complaints/authorities", response_model=list[ComplaintAuthorityRead])
def list_authorities(current_user: User = Depends(get_current_user)):
    """Return all selectable authorities and whether each has a configured email."""
    return complaint_recipients.list_authorities()


@router.get(
    "/reports/{report_id}/complaints",
    response_model=list[ComplaintSubmissionRead],
)
def list_report_complaints(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the complaint submission history for a report (newest first)."""
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הדיווח לא נמצא.")
    return (
        db.query(ComplaintSubmission)
        .filter(ComplaintSubmission.report_id == report_id)
        .order_by(ComplaintSubmission.created_at.desc())
        .all()
    )


def _gather_attachments(report: ReportModel, storage: StorageProvider) -> list[Attachment]:
    """Read each linked image's original bytes (EXIF intact) for the email."""
    attachments: list[Attachment] = []
    for image in report.images:
        try:
            data = storage.read(image.file_path)
        except FileNotFoundError:
            continue  # skip a missing file rather than failing the whole complaint
        mime, _ = mimetypes.guess_type(image.original_filename)
        attachments.append((image.original_filename, mime or "application/octet-stream", data))
    return attachments


@router.post(
    "/reports/{report_id}/complaints",
    response_model=ComplaintSubmitResult,
    status_code=status.HTTP_201_CREATED,
)
def submit_complaints(
    report_id: str,
    payload: ComplaintSubmitRequest,
    db: Session = Depends(get_db),
    storage: StorageProvider = Depends(get_storage),
    current_user: User = Depends(get_current_user),
):
    """
    Submit a report as a complaint to one or more authorities.

    Records one ComplaintSubmission row per authority (status sent|failed).
    """
    if current_user.role not in _SUBMIT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="הגשת תלונה מותרת למנהלים בלבד.",
        )

    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הדיווח לא נמצא.")

    if report.status not in _ELIGIBLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ניתן להגיש תלונה רק על דיווח שאושר בשטח או מאושר.",
        )

    if not payload.authorities:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="יש לבחור רשות אחת לפחות.",
        )

    unknown = [a for a in payload.authorities if not complaint_recipients.is_known(a)]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"רשות לא מוכרת: {', '.join(unknown)}",
        )

    # De-duplicate while preserving order (selecting the same authority twice
    # shouldn't send twice).
    requested = list(dict.fromkeys(payload.authorities))

    attachments = _gather_attachments(report, storage)

    results: list[ComplaintSubmitResultItem] = []
    for key in requested:
        label = complaint_recipients.authority_label(key) or key
        email = complaint_recipients.authority_email(key)

        if not email:
            outcome, error = "failed", "אין כתובת דוא״ל מוגדרת לרשות זו."
        else:
            try:
                subject, body = render_complaint(report, report.user, label)
                send_email(email, subject, body, attachments)
                outcome, error = "sent", None
            except Exception as exc:  # noqa: BLE001 — isolate per recipient
                outcome, error = "failed", str(exc)

        db.add(
            ComplaintSubmission(
                report_id=report.id,
                authority_key=key,
                authority_label=label,
                recipient_email=email or "",
                status=outcome,
                error_message=error,
                submitted_by=current_user.id,
            )
        )
        results.append(
            ComplaintSubmitResultItem(
                authority_key=key,
                authority_label=label,
                status=outcome,
                error_message=error,
            )
        )

    db.commit()
    return ComplaintSubmitResult(results=results)
