"""
Maps complaint-authority keys to their Hebrew labels (constants) and configured
recipient emails (settings). Keeps constants.py free of any settings dependency.
"""

from backend.core.config import settings
from backend.core.constants import COMPLAINT_AUTHORITY_LABELS, ComplaintAuthority

# Authority key → name of the Settings field holding its recipient email.
_EMAIL_SETTING: dict[str, str] = {
    ComplaintAuthority.POLICE.value: "COMPLAINT_EMAIL_POLICE",
    ComplaintAuthority.ILA.value: "COMPLAINT_EMAIL_ILA",
    ComplaintAuthority.ENV_MINISTRY.value: "COMPLAINT_EMAIL_ENV_MINISTRY",
    ComplaintAuthority.LOCAL_PLANNING.value: "COMPLAINT_EMAIL_LOCAL_PLANNING",
    ComplaintAuthority.CIVIL_ADMIN.value: "COMPLAINT_EMAIL_CIVIL_ADMIN",
}


def is_known(key: str) -> bool:
    return key in COMPLAINT_AUTHORITY_LABELS


def authority_label(key: str) -> str | None:
    return COMPLAINT_AUTHORITY_LABELS.get(key)


def authority_email(key: str) -> str | None:
    """Configured recipient email for an authority, or None if unset/unknown."""
    field = _EMAIL_SETTING.get(key)
    if not field:
        return None
    value = (getattr(settings, field, "") or "").strip()
    return value or None


def list_authorities() -> list[dict]:
    """All authorities with their label and whether an email is configured."""
    return [
        {"key": key, "label": label, "available": authority_email(key) is not None}
        for key, label in COMPLAINT_AUTHORITY_LABELS.items()
    ]
