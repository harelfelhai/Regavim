"""Unit tests for the Hebrew complaint-letter renderer (pure, no I/O)."""

from datetime import datetime, timezone

from backend.models.report import Report
from backend.models.user import User
from backend.services.complaint_template import render_complaint


def _report(**overrides) -> Report:
    base = dict(
        id="abc12345",
        final_category="ILLEGAL_CONSTRUCTION",
        description="מבנה בטון ללא היתר",
        observed_at=datetime(2026, 5, 1, 9, 30, tzinfo=timezone.utc),
        created_at=datetime(2026, 5, 2, 8, 0, tzinfo=timezone.utc),
        target_lat=32.1057,
        target_lng=35.1839,
        user_lat=32.10,
        user_lng=35.18,
        land_context="שטח C",
        tags=["פרשייה-1"],
    )
    base.update(overrides)
    return Report(**base)


def test_subject_contains_report_id():
    subject, _ = render_complaint(_report(), None, "משטרת ישראל")
    assert "abc12345" in subject


def test_body_contains_authority_and_category_label():
    _, body = render_complaint(_report(), None, "משטרת ישראל")
    assert "משטרת ישראל" in body
    assert "בנייה לא חוקית" in body  # Hebrew label for ILLEGAL_CONSTRUCTION


def test_body_contains_description_and_reporter_email():
    reporter = User(id="u1", email="rep@regavim.org", role="coordinator", hashed_password="x")
    _, body = render_complaint(_report(), reporter, "המשרד להגנת הסביבה")
    assert "מבנה בטון ללא היתר" in body
    assert "rep@regavim.org" in body


def test_body_contains_maps_link():
    _, body = render_complaint(_report(), None, "רשות מקרקעי ישראל")
    assert "google.com/maps" in body


def test_missing_fields_render_as_dash():
    report = _report(
        final_category=None, description=None, observed_at=None,
        target_lat=None, target_lng=None, user_lat=None, user_lng=None,
        land_context=None, tags=None,
    )
    _, body = render_complaint(report, None, "המינהל האזרחי")
    assert "—" in body
    # Should not raise and should still address the authority.
    assert "המינהל האזרחי" in body
