"""
ORM-level tests — verify model defaults, constraints, and updated_at behaviour.
"""

import time

from backend.core.constants import ReportStatus
from backend.models.report import Report

_USER_ID = "00000000-0000-0000-0000-000000000001"


def test_report_uuid_generated_automatically(db):
    report = Report(user_id=_USER_ID)
    db.add(report)
    db.commit()
    db.refresh(report)
    assert report.id is not None
    assert len(report.id) == 36  # UUID format


def test_report_default_status_is_pending(db):
    report = Report(user_id=_USER_ID)
    db.add(report)
    db.commit()
    db.refresh(report)
    assert report.status == ReportStatus.PENDING.value


def test_report_ai_fields_default_to_none(db):
    report = Report(user_id=_USER_ID)
    db.add(report)
    db.commit()
    db.refresh(report)
    assert report.ai_category is None
    assert report.final_category is None
    assert report.land_context is None


def test_report_timestamps_set_on_create(db):
    report = Report(user_id=_USER_ID)
    db.add(report)
    db.commit()
    db.refresh(report)
    assert report.created_at is not None
    assert report.updated_at is not None


def test_created_at_equals_updated_at_on_create(db):
    report = Report(user_id=_USER_ID)
    db.add(report)
    db.commit()
    db.refresh(report)
    # Allow for sub-millisecond difference introduced by lambda evaluation order
    delta = abs((report.updated_at - report.created_at).total_seconds())
    assert delta < 1.0


def test_updated_at_advances_on_update(db):
    report = Report(user_id=_USER_ID, description="original")
    db.add(report)
    db.commit()
    db.refresh(report)
    original_updated_at = report.updated_at

    time.sleep(0.05)  # ensure the clock advances before the next write
    report.description = "modified"
    db.commit()
    db.refresh(report)

    assert report.updated_at > original_updated_at


def test_created_at_does_not_change_on_update(db):
    report = Report(user_id=_USER_ID, description="original")
    db.add(report)
    db.commit()
    db.refresh(report)
    original_created_at = report.created_at

    report.description = "modified"
    db.commit()
    db.refresh(report)

    assert report.created_at == original_created_at


def test_two_reports_have_different_ids(db):
    r1 = Report(user_id=_USER_ID)
    r2 = Report(user_id=_USER_ID)
    db.add_all([r1, r2])
    db.commit()
    assert r1.id != r2.id


def test_all_location_fields_nullable(db):
    report = Report(user_id=_USER_ID)
    db.add(report)
    db.commit()
    db.refresh(report)
    assert report.user_lat is None
    assert report.user_lng is None
    assert report.target_lat is None
    assert report.target_lng is None
