"""
Integration tests — POST /api/v1/reports/submit (atomic image+report endpoint).

Each test submits a valid multipart payload and verifies the response,
the linked image record, and the report status / field mapping.
"""

import io
import json

import pytest
from PIL import Image as PILImage

_SUBMIT = "/api/v1/reports/submit"


def _jpeg() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (64, 64), color=(10, 20, 30)).save(buf, format="JPEG")
    return buf.getvalue()


def _multipart(extra_fields: dict | None = None):
    fields = {"description": "דיווח בדיקה", **(extra_fields or {})}
    return {k: (None, str(v)) for k, v in fields.items()}


class TestSubmitBasic:
    def test_creates_report_and_returns_201(self, client):
        r = client.post(
            _SUBMIT,
            data={"description": "בדיקה", "final_category": "ILLEGAL_CONSTRUCTION"},
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        assert r.status_code == 201

    def test_response_includes_report_fields(self, client):
        r = client.post(
            _SUBMIT,
            data={"description": "שדה בדיקה", "final_category": "ILLEGAL_CONSTRUCTION"},
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        data = r.json()
        assert data["description"] == "שדה בדיקה"
        assert data["status"] == "confirmed"
        assert data["id"] is not None

    def test_image_linked_in_image_ids(self, client):
        r = client.post(
            _SUBMIT,
            data={"description": "בדיקה", "final_category": "ILLEGAL_CONSTRUCTION"},
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        data = r.json()
        assert len(data["image_ids"]) == 1

    def test_rejects_when_no_category(self, client):
        """The reporting threshold requires a category — a description alone is 422."""
        r = client.post(
            _SUBMIT,
            data={"description": "בדיקה"},
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        assert r.status_code == 422

    def test_rejects_when_no_description(self, client):
        """The reporting threshold requires a description too."""
        r = client.post(
            _SUBMIT,
            data={"final_category": "ILLEGAL_CONSTRUCTION"},
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        assert r.status_code == 422

    def test_confirmed_when_category_and_description_provided(self, client):
        r = client.post(
            _SUBMIT,
            data={"description": "תיאור מלא", "final_category": "ROAD_PAVING"},
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        assert r.json()["status"] == "confirmed"
        assert r.json()["final_category"] == "ROAD_PAVING"


class TestSubmitCoordinates:
    def test_coordinates_stored(self, client):
        r = client.post(
            _SUBMIT,
            data={
                "description": "בדיקה",
                "final_category": "ILLEGAL_CONSTRUCTION",
                "user_lat": "31.5",
                "user_lng": "34.9",
                "target_lat": "31.6",
                "target_lng": "35.0",
            },
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        data = r.json()
        assert data["target_lat"] == pytest.approx(31.6)
        assert data["target_lng"] == pytest.approx(35.0)
        assert data["user_lat"] == pytest.approx(31.5)
        assert data["user_lng"] == pytest.approx(34.9)

    def test_observed_at_stored(self, client):
        r = client.post(
            _SUBMIT,
            data={
                "description": "בדיקה",
                "final_category": "ILLEGAL_CONSTRUCTION",
                "observed_at": "2024-03-15T10:00:00.000Z",
            },
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        assert r.json()["observed_at"] is not None

    def test_invalid_observed_at_returns_422(self, client):
        r = client.post(
            _SUBMIT,
            data={
                "description": "בדיקה",
                "final_category": "ILLEGAL_CONSTRUCTION",
                "observed_at": "not-a-date",
            },
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        assert r.status_code == 422


class TestSubmitTags:
    def test_tags_stored(self, client):
        r = client.post(
            _SUBMIT,
            data={
                "description": "בדיקה",
                "final_category": "ILLEGAL_CONSTRUCTION",
                "tags": json.dumps(["פרשייה א", "פרשייה ב"]),
            },
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        assert r.json()["tags"] == ["פרשייה א", "פרשייה ב"]

    def test_empty_tags_field_produces_empty_list(self, client):
        r = client.post(
            _SUBMIT,
            data={"description": "בדיקה", "final_category": "ILLEGAL_CONSTRUCTION"},
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        assert r.json()["tags"] == []


class TestSubmitValidation:
    def test_confirmed_without_description_returns_422(self, client):
        r = client.post(
            _SUBMIT,
            data={"final_category": "ROAD_PAVING"},
            files={"file": ("photo.jpg", _jpeg(), "image/jpeg")},
        )
        assert r.status_code == 422

    def test_oversized_image_returns_413(self, client):
        big = b"\xff\xd8\xff\xe0" + b"x" * (11 * 1024 * 1024)
        r = client.post(
            _SUBMIT,
            data={"description": "בדיקה"},
            files={"file": ("big.jpg", big, "image/jpeg")},
        )
        assert r.status_code == 413

    def test_corrupt_image_returns_422(self, client):
        r = client.post(
            _SUBMIT,
            data={"description": "בדיקה"},
            files={"file": ("bad.jpg", b"not-an-image", "image/jpeg")},
        )
        assert r.status_code == 422

    def test_missing_file_returns_422(self, client):
        r = client.post(_SUBMIT, data={"description": "בדיקה"})
        assert r.status_code == 422
