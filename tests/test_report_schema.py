"""
Unit tests for Pydantic schema validation on the Report resource.

Covers: happy path, GPS boundary values, out-of-range coordinates,
extreme values, and optional-field defaults.
"""

import pytest
from pydantic import ValidationError

from backend.schemas.report import ReportCreate, ReportUpdate
from backend.core.constants import ReportStatus, ViolationCategory


class TestReportCreateHappyPath:
    def test_full_valid_payload(self):
        r = ReportCreate(
            description="Unauthorized road paving near ridge",
            user_lat=31.5,
            user_lng=34.9,
            target_lat=31.6,
            target_lng=35.0,
            land_context="State land",
        )
        assert r.description == "Unauthorized road paving near ridge"
        assert r.user_lat == 31.5
        assert r.target_lng == 35.0

    def test_all_fields_optional_none(self):
        r = ReportCreate()
        assert r.user_lat is None
        assert r.user_lng is None
        assert r.target_lat is None
        assert r.target_lng is None
        assert r.description is None
        assert r.land_context is None

    def test_empty_string_description_accepted(self):
        # Empty string is not None — schema does not enforce non-empty
        r = ReportCreate(description="")
        assert r.description == ""

    def test_land_context_long_string_accepted(self):
        r = ReportCreate(land_context="X" * 255)
        assert len(r.land_context) == 255


class TestLatitudeValidation:
    def test_valid_positive_latitude(self):
        assert ReportCreate(user_lat=31.5).user_lat == 31.5

    def test_valid_negative_latitude(self):
        assert ReportCreate(target_lat=-31.5).target_lat == -31.5

    def test_exact_lower_bound_accepted(self):
        assert ReportCreate(user_lat=-90.0).user_lat == -90.0

    def test_exact_upper_bound_accepted(self):
        assert ReportCreate(target_lat=90.0).target_lat == 90.0

    def test_one_thousandth_above_upper_bound_rejected(self):
        with pytest.raises(ValidationError) as exc:
            ReportCreate(user_lat=90.001)
        assert "latitude" in str(exc.value).lower()

    def test_one_thousandth_below_lower_bound_rejected(self):
        with pytest.raises(ValidationError):
            ReportCreate(target_lat=-90.001)

    def test_extreme_high_latitude_rejected(self):
        with pytest.raises(ValidationError):
            ReportCreate(user_lat=9999.0)

    def test_extreme_low_latitude_rejected(self):
        with pytest.raises(ValidationError):
            ReportCreate(user_lat=-9999.0)

    def test_none_latitude_accepted(self):
        assert ReportCreate(user_lat=None).user_lat is None


class TestLongitudeValidation:
    def test_valid_positive_longitude(self):
        assert ReportCreate(user_lng=34.9).user_lng == 34.9

    def test_exact_lower_bound_accepted(self):
        assert ReportCreate(user_lng=-180.0).user_lng == -180.0

    def test_exact_upper_bound_accepted(self):
        assert ReportCreate(target_lng=180.0).target_lng == 180.0

    def test_one_thousandth_above_upper_bound_rejected(self):
        with pytest.raises(ValidationError) as exc:
            ReportCreate(user_lng=180.001)
        assert "longitude" in str(exc.value).lower()

    def test_one_thousandth_below_lower_bound_rejected(self):
        with pytest.raises(ValidationError):
            ReportCreate(target_lng=-180.001)

    def test_extreme_high_longitude_rejected(self):
        with pytest.raises(ValidationError):
            ReportCreate(user_lng=99999.0)

    def test_none_longitude_accepted(self):
        assert ReportCreate(target_lng=None).target_lng is None


class TestReportUpdate:
    def test_valid_status_update(self):
        u = ReportUpdate(status=ReportStatus.APPROVED)
        assert u.status == ReportStatus.APPROVED

    def test_valid_category_update(self):
        u = ReportUpdate(final_category=ViolationCategory.ILLEGAL_CONSTRUCTION)
        assert u.final_category == ViolationCategory.ILLEGAL_CONSTRUCTION

    def test_all_optional(self):
        u = ReportUpdate()
        assert u.status is None
        assert u.final_category is None

    def test_invalid_status_string_rejected(self):
        with pytest.raises(ValidationError):
            ReportUpdate(status="not_a_valid_status")

    def test_invalid_category_string_rejected(self):
        with pytest.raises(ValidationError):
            ReportUpdate(final_category="MADE_UP_CATEGORY")
