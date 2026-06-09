"""
Renders a report into a formal Hebrew complaint letter (subject + body).

Pure and deterministic — no I/O, no AI — so it is fully unit-testable. Missing
fields degrade gracefully to "—" rather than raising, since a report may be
filed before every optional field is populated.
"""

from datetime import datetime

from backend.core.constants import VIOLATION_CATEGORY_LABELS
from backend.models.report import Report
from backend.models.user import User


def _fmt_dt(value: datetime | None) -> str:
    return value.strftime("%d/%m/%Y %H:%M") if value else "—"


def _fmt_text(value: str | None) -> str:
    text = (value or "").strip()
    return text or "—"


def _fmt_category(value: str | None) -> str:
    if not value:
        return "—"
    return VIOLATION_CATEGORY_LABELS.get(value, value)


def _fmt_location(lat: float | None, lng: float | None) -> str:
    if lat is None or lng is None:
        return "—"
    coords = f"{lat:.5f}, {lng:.5f}"
    link = f"https://www.google.com/maps?q={lat},{lng}"
    return f"{coords} ({link})"


def _fmt_tags(tags: list[str] | None) -> str:
    return ", ".join(tags) if tags else "—"


def render_complaint(
    report: Report,
    reporter: User | None,
    authority_label: str,
) -> tuple[str, str]:
    """Return (subject, body) for a complaint email about `report`."""
    subject = f"תלונה על הפרת שימוש בקרקע — דיווח מס׳ {report.id}"

    reporter_contact = reporter.email if reporter and reporter.email else "—"

    body = f"""לכבוד {authority_label},

הנדון: פנייה ראשונית — תלונה על הפרת שימוש בקרקע (דיווח מס׳ {report.id})

ארגון רגבים מתעד הפרות בנייה ושימוש בלתי-חוקי בקרקע. זוהי פנייה ראשונית
המביאה לידיעתכם הפרה שתועדה בשטח, לצורך פתיחת בדיקה ואכיפה. ככל שיידרש,
נשמח להעביר תיעוד וראיות נוספים. פרטי ההפרה כמפורט להלן:

סוג העבירה: {_fmt_category(report.final_category)}
תיאור ההפרה: {_fmt_text(report.description)}
מועד הצפייה בהפרה: {_fmt_dt(report.observed_at)}
מועד הדיווח: {_fmt_dt(report.created_at)}
מיקום ההפרה: {_fmt_location(report.target_lat, report.target_lng)}
מיקום המדווח בעת התיעוד: {_fmt_location(report.user_lat, report.user_lng)}
הקשר קרקעי: {_fmt_text(report.land_context)}
תגיות: {_fmt_tags(report.tags)}

פרטי קשר של המדווח: {reporter_contact}

מצורפת תמונת/ות ראיה הכוללות נתוני EXIF מקוריים (מיקום וחותמת זמן) לצורך אימות.

נודה לטיפולכם בהקדם.

בכבוד רב,
ארגון רגבים
"""
    return subject, body
