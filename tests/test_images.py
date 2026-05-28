"""
Stage 4 + Stage 5 integration and unit tests — image upload and AI analysis pipeline.

Test matrix (Stage 4):
  Happy path       — JPEG with full GPS + timestamp EXIF → has_exif True
  No-EXIF cases    — plain JPEG, PNG, JPEG with make/model only → has_exif False
  Anomalies        — corrupt bytes, oversized file, path traversal filename
  Concurrency      — 5 simultaneous uploads to same report, all unique IDs
  Service units    — exif_has_legal_metadata() logic in isolation

Test matrix (Stage 5 — TestAnalyzeEndpoint):
  Happy path       — valid category returned, report.ai_category set
  Timeout/error    — None returned, endpoint still 200, analysis_available=False
  Suggested/confirmed separation — ai_category set, final_category stays None
  TIFF skipped     — unsupported format, analysis_available=False
  Invalid image_id — 404

Image fixtures use piexif to inject controlled EXIF data so tests are
deterministic and don't rely on external image files.
"""

import io
import threading
from pathlib import Path
from unittest.mock import patch

import piexif
import pytest
from PIL import Image as PILImage

from backend.api.v1.images import get_storage
from backend.main import app
from backend.services.image_service import exif_has_legal_metadata, extract_exif
from backend.services.image_service import MAX_IMAGE_BYTES
from backend.services.storage import LocalStorageProvider


# ── Image factories ───────────────────────────────────────────────────────────

def _jpeg(exif_bytes: bytes | None = None) -> bytes:
    """Minimal in-memory JPEG, optionally with embedded EXIF bytes."""
    buf = io.BytesIO()
    img = PILImage.new("RGB", (64, 64), color=(100, 150, 200))
    kwargs = {"format": "JPEG"}
    if exif_bytes is not None:
        kwargs["exif"] = exif_bytes
    img.save(buf, **kwargs)
    return buf.getvalue()


def _png() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (64, 64)).save(buf, format="PNG")
    return buf.getvalue()


def jpeg_with_gps_and_timestamp() -> bytes:
    """JPEG containing GPS coordinates and DateTimeOriginal — has_exif should be True."""
    exif_dict = {
        "0th": {
            piexif.ImageIFD.Make: b"FieldCam",
            piexif.ImageIFD.Model: b"Pro 3000",
        },
        "Exif": {
            piexif.ExifIFD.DateTimeOriginal: b"2024:03:22 09:15:00",
        },
        "GPS": {
            piexif.GPSIFD.GPSLatitudeRef: b"N",
            piexif.GPSIFD.GPSLatitude: ((31, 1), (30, 1), (0, 1)),
            piexif.GPSIFD.GPSLongitudeRef: b"E",
            piexif.GPSIFD.GPSLongitude: ((35, 1), (0, 1), (0, 1)),
        },
        "1st": {},
    }
    return _jpeg(piexif.dump(exif_dict))


def jpeg_with_make_model_only() -> bytes:
    """JPEG with device metadata but NO GPS or timestamp — has_exif should be False."""
    exif_dict = {
        "0th": {
            piexif.ImageIFD.Make: b"GenericBrand",
            piexif.ImageIFD.Model: b"XR-100",
        },
        "Exif": {},
        "GPS": {},
        "1st": {},
    }
    return _jpeg(piexif.dump(exif_dict))


def jpeg_with_timestamp_only() -> bytes:
    """JPEG with DateTimeOriginal but no GPS — has_exif should still be True."""
    exif_dict = {
        "0th": {},
        "Exif": {
            piexif.ExifIFD.DateTimeOriginal: b"2024:06:01 12:00:00",
        },
        "GPS": {},
        "1st": {},
    }
    return _jpeg(piexif.dump(exif_dict))


def jpeg_no_exif() -> bytes:
    """Plain JPEG with no EXIF block at all."""
    return _jpeg()


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def upload_client(client, tmp_path):
    """
    TestClient with the storage dependency overridden to use a temp directory.
    Uploaded files are written there and cleaned up by pytest after the test.
    """
    provider = LocalStorageProvider(tmp_path)
    app.dependency_overrides[get_storage] = lambda: provider
    yield client
    app.dependency_overrides.pop(get_storage, None)


@pytest.fixture
def report_id(upload_client):
    """A freshly created report to attach images to."""
    return upload_client.post("/api/v1/reports/", json={}).json()["id"]


# ── Helper ────────────────────────────────────────────────────────────────────

def _upload(client, report_id: str, image_bytes: bytes, filename: str = "photo.jpg"):
    return client.post(
        "/api/v1/images/upload",
        data={"report_id": report_id},
        files={"file": (filename, image_bytes, "image/jpeg")},
    )


def _upload_staged(client, image_bytes: bytes, filename: str = "photo.jpg"):
    """Upload with no report_id — image is staged until a report is created."""
    return client.post(
        "/api/v1/images/upload",
        files={"file": (filename, image_bytes, "image/jpeg")},
    )


# ── Happy path ────────────────────────────────────────────────────────────────

class TestUploadHappyPath:
    def test_jpeg_with_full_exif_returns_201(self, upload_client, report_id):
        response = _upload(upload_client, report_id, jpeg_with_gps_and_timestamp())
        assert response.status_code == 201

    def test_has_exif_true_for_jpeg_with_gps_and_timestamp(self, upload_client, report_id):
        data = _upload(upload_client, report_id, jpeg_with_gps_and_timestamp()).json()
        assert data["has_exif"] is True

    def test_response_contains_expected_fields(self, upload_client, report_id):
        data = _upload(upload_client, report_id, jpeg_with_gps_and_timestamp()).json()
        assert "id" in data
        assert data["report_id"] == report_id
        assert "file_path" in data
        assert "original_filename" in data
        assert "uploaded_at" in data

    def test_exif_data_stored_in_response(self, upload_client, report_id):
        data = _upload(upload_client, report_id, jpeg_with_gps_and_timestamp()).json()
        assert data["exif_data"] is not None
        assert isinstance(data["exif_data"], dict)

    def test_gps_sub_ifd_included_in_exif_data(self, upload_client, report_id):
        data = _upload(upload_client, report_id, jpeg_with_gps_and_timestamp()).json()
        assert "gps_ifd" in data["exif_data"]

    def test_file_is_written_to_storage(self, upload_client, report_id, tmp_path):
        _upload(upload_client, report_id, jpeg_with_gps_and_timestamp())
        stored = list(tmp_path.iterdir())
        assert len(stored) == 1
        assert stored[0].suffix == ".jpeg"

    def test_timestamp_only_exif_sets_has_exif_true(self, upload_client, report_id):
        data = _upload(upload_client, report_id, jpeg_with_timestamp_only()).json()
        assert data["has_exif"] is True

    def test_png_upload_accepted(self, upload_client, report_id):
        response = upload_client.post(
            "/api/v1/images/upload",
            data={"report_id": report_id},
            files={"file": ("photo.png", _png(), "image/png")},
        )
        assert response.status_code == 201


# ── No-EXIF cases ─────────────────────────────────────────────────────────────

class TestNoExifCases:
    def test_plain_jpeg_without_exif_returns_201(self, upload_client, report_id):
        response = _upload(upload_client, report_id, jpeg_no_exif())
        assert response.status_code == 201

    def test_has_exif_false_for_jpeg_without_exif(self, upload_client, report_id):
        data = _upload(upload_client, report_id, jpeg_no_exif()).json()
        assert data["has_exif"] is False

    def test_exif_data_none_for_jpeg_without_exif(self, upload_client, report_id):
        data = _upload(upload_client, report_id, jpeg_no_exif()).json()
        assert data["exif_data"] is None

    def test_has_exif_false_for_png(self, upload_client, report_id):
        response = upload_client.post(
            "/api/v1/images/upload",
            data={"report_id": report_id},
            files={"file": ("photo.png", _png(), "image/png")},
        )
        assert response.json()["has_exif"] is False

    def test_has_exif_false_for_make_model_only(self, upload_client, report_id):
        """Make and Model fields alone must NOT trigger has_exif = True."""
        data = _upload(upload_client, report_id, jpeg_with_make_model_only()).json()
        assert data["has_exif"] is False


# ── Anomalies & Resilience ────────────────────────────────────────────────────

class TestAnomalies:
    def test_corrupt_bytes_returns_422(self, upload_client, report_id):
        response = _upload(upload_client, report_id, b"not an image at all")
        assert response.status_code == 422

    def test_empty_bytes_returns_422(self, upload_client, report_id):
        response = _upload(upload_client, report_id, b"")
        assert response.status_code == 422

    def test_truncated_jpeg_returns_422(self, upload_client, report_id):
        truncated = jpeg_no_exif()[:20]
        response = _upload(upload_client, report_id, truncated)
        assert response.status_code == 422

    def test_oversized_file_returns_413(self, upload_client, report_id):
        oversized = b"x" * (MAX_IMAGE_BYTES + 1)
        response = _upload(upload_client, report_id, oversized, "big.jpg")
        assert response.status_code == 413

    def test_413_error_message_mentions_size_limit(self, upload_client, report_id):
        oversized = b"x" * (MAX_IMAGE_BYTES + 1)
        detail = _upload(upload_client, report_id, oversized).json()["detail"]
        assert "10 MB" in detail or "limit" in detail.lower()

    def test_unsupported_format_returns_422(self, upload_client, report_id):
        buf = io.BytesIO()
        PILImage.new("RGB", (64, 64)).save(buf, format="BMP")
        response = upload_client.post(
            "/api/v1/images/upload",
            data={"report_id": report_id},
            files={"file": ("photo.bmp", buf.getvalue(), "image/bmp")},
        )
        assert response.status_code == 422

    def test_nonexistent_report_id_returns_404(self, upload_client):
        response = _upload(upload_client, "nonexistent-report-id", jpeg_no_exif())
        assert response.status_code == 404

    def test_path_traversal_filename_stored_safely(self, upload_client, report_id):
        """
        The original filename is stripped to its basename before storage.
        The on-disk path uses a UUID and must never contain '..'.
        """
        data = _upload(
            upload_client, report_id, jpeg_no_exif(), "../../etc/passwd.jpg"
        ).json()
        assert data is not None
        # Response must succeed (we accept the file; just sanitise the name)
        assert ".." not in data["file_path"]
        # Stored original_filename is the basename only
        assert data["original_filename"] == "passwd.jpg"

    def test_path_traversal_file_not_written_outside_upload_dir(
        self, upload_client, report_id, tmp_path
    ):
        _upload(upload_client, report_id, jpeg_no_exif(), "../escape.jpg")
        # No files written outside tmp_path
        assert not (tmp_path.parent / "escape.jpg").exists()


# ── Concurrency ───────────────────────────────────────────────────────────────

class TestConcurrency:
    def test_five_concurrent_uploads_all_succeed(self, upload_client, report_id):
        """
        Five threads upload simultaneously to the same report.
        All must receive 201 and produce distinct image IDs.
        """
        results: list[dict] = []
        lock = threading.Lock()

        def upload():
            r = _upload(upload_client, report_id, jpeg_no_exif())
            with lock:
                results.append(r.json())

        threads = [threading.Thread(target=upload) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(results) == 5
        ids = {r["id"] for r in results}
        assert len(ids) == 5, "Each upload must produce a unique image ID"

    def test_concurrent_uploads_produce_unique_filenames(
        self, upload_client, report_id, tmp_path
    ):
        """UUID-based filenames must not collide even under concurrent load."""

        def upload():
            _upload(upload_client, report_id, jpeg_no_exif())

        threads = [threading.Thread(target=upload) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        stored = list(tmp_path.iterdir())
        assert len(stored) == 5


# ── exif_has_legal_metadata unit tests ───────────────────────────────────────

class TestExifHasLegalMetadata:
    def test_jpeg_with_gps_returns_true(self):
        assert exif_has_legal_metadata(jpeg_with_gps_and_timestamp()) is True

    def test_jpeg_with_timestamp_only_returns_true(self):
        assert exif_has_legal_metadata(jpeg_with_timestamp_only()) is True

    def test_jpeg_with_make_model_only_returns_false(self):
        assert exif_has_legal_metadata(jpeg_with_make_model_only()) is False

    def test_jpeg_without_exif_returns_false(self):
        assert exif_has_legal_metadata(jpeg_no_exif()) is False

    def test_png_returns_false(self):
        assert exif_has_legal_metadata(_png()) is False

    def test_corrupt_bytes_returns_false(self):
        assert exif_has_legal_metadata(b"garbage") is False

    def test_empty_bytes_returns_false(self):
        assert exif_has_legal_metadata(b"") is False


# ── extract_exif enrichment tests ─────────────────────────────────────────────

class TestExtractExifEnriched:
    def test_gps_ifd_present_in_result(self):
        result = extract_exif(jpeg_with_gps_and_timestamp())
        assert result is not None
        assert "gps_ifd" in result

    def test_jpeg_without_exif_returns_none(self):
        assert extract_exif(jpeg_no_exif()) is None

    def test_png_returns_none(self):
        assert extract_exif(_png()) is None

    def test_corrupt_bytes_returns_none(self):
        assert extract_exif(b"not an image") is None


# ── Stage 5: /analyze endpoint ────────────────────────────────────────────────

class TestAnalyzeEndpoint:
    @patch("backend.api.v1.images.analyze_image_with_claude")
    def test_happy_path_returns_200(self, mock_analyze, upload_client, report_id):
        mock_analyze.return_value = "ILLEGAL_CONSTRUCTION"
        image_id = _upload(upload_client, report_id, jpeg_no_exif()).json()["id"]
        response = upload_client.post("/api/v1/images/analyze", data={"image_id": image_id})
        assert response.status_code == 200

    @patch("backend.api.v1.images.analyze_image_with_claude")
    def test_happy_path_returns_valid_category(self, mock_analyze, upload_client, report_id):
        mock_analyze.return_value = "ILLEGAL_CONSTRUCTION"
        image_id = _upload(upload_client, report_id, jpeg_no_exif()).json()["id"]
        data = upload_client.post("/api/v1/images/analyze", data={"image_id": image_id}).json()
        assert data["ai_category"] == "ILLEGAL_CONSTRUCTION"
        assert data["analysis_available"] is True

    @patch("backend.api.v1.images.analyze_image_with_claude")
    def test_timeout_returns_200_with_no_category(self, mock_analyze, upload_client, report_id):
        mock_analyze.return_value = None
        image_id = _upload(upload_client, report_id, jpeg_no_exif()).json()["id"]
        data = upload_client.post("/api/v1/images/analyze", data={"image_id": image_id}).json()
        assert data["ai_category"] is None
        assert data["analysis_available"] is False

    @patch("backend.api.v1.images.analyze_image_with_claude")
    def test_ai_category_persisted_on_report(self, mock_analyze, upload_client, report_id):
        mock_analyze.return_value = "ROAD_PAVING"
        image_id = _upload(upload_client, report_id, jpeg_no_exif()).json()["id"]
        upload_client.post("/api/v1/images/analyze", data={"image_id": image_id})
        report = upload_client.get(f"/api/v1/reports/{report_id}").json()
        assert report["ai_category"] == "ROAD_PAVING"

    @patch("backend.api.v1.images.analyze_image_with_claude")
    def test_suggested_does_not_set_final_category(self, mock_analyze, upload_client, report_id):
        mock_analyze.return_value = "DEMOLITION"
        image_id = _upload(upload_client, report_id, jpeg_no_exif()).json()["id"]
        upload_client.post("/api/v1/images/analyze", data={"image_id": image_id})
        report = upload_client.get(f"/api/v1/reports/{report_id}").json()
        assert report["ai_category"] == "DEMOLITION"
        assert report["final_category"] is None

    @patch("backend.api.v1.images.analyze_image_with_claude")
    def test_tiff_analysis_available_false(self, mock_analyze, upload_client, report_id):
        """TIFF uploads succeed but AI skips them — analysis_available must be False."""
        mock_analyze.return_value = None
        buf = io.BytesIO()
        PILImage.new("RGB", (64, 64)).save(buf, format="TIFF")
        response = upload_client.post(
            "/api/v1/images/upload",
            data={"report_id": report_id},
            files={"file": ("photo.tiff", buf.getvalue(), "image/tiff")},
        )
        image_id = response.json()["id"]
        data = upload_client.post("/api/v1/images/analyze", data={"image_id": image_id}).json()
        assert data["analysis_available"] is False

    def test_nonexistent_image_returns_404(self, upload_client):
        response = upload_client.post("/api/v1/images/analyze", data={"image_id": "nonexistent"})
        assert response.status_code == 404


# ── File-serving endpoint ─────────────────────────────────────────────────────

class TestFileEndpoint:
    def test_returns_200_and_binary_content(self, upload_client, report_id):
        image_bytes = jpeg_no_exif()
        image_id = _upload(upload_client, report_id, image_bytes).json()["id"]
        response = upload_client.get(f"/api/v1/images/{image_id}/file")
        assert response.status_code == 200
        assert len(response.content) > 0

    def test_content_type_is_image_jpeg(self, upload_client, report_id):
        image_id = _upload(upload_client, report_id, jpeg_no_exif(), "photo.jpg").json()["id"]
        response = upload_client.get(f"/api/v1/images/{image_id}/file")
        assert response.headers["content-type"].startswith("image/jpeg")

    def test_nonexistent_image_id_returns_404(self, upload_client):
        response = upload_client.get("/api/v1/images/does-not-exist/file")
        assert response.status_code == 404

    def test_report_image_ids_includes_uploaded_image(self, upload_client, report_id):
        """After upload, GET /reports/{id} should list the image's id in image_ids."""
        image_id = _upload(upload_client, report_id, jpeg_no_exif()).json()["id"]
        report = upload_client.get(f"/api/v1/reports/{report_id}").json()
        assert image_id in report["image_ids"]


# ── Staged images (deferred report creation) ──────────────────────────────────

class TestStagedImages:
    def test_upload_without_report_id_is_staged(self, upload_client):
        data = _upload_staged(upload_client, jpeg_no_exif()).json()
        assert data["report_id"] is None

    def test_create_report_with_image_id_links_image(self, upload_client):
        image_id = _upload_staged(upload_client, jpeg_no_exif()).json()["id"]
        report = upload_client.post(
            "/api/v1/reports/",
            json={"description": "x", "final_category": "DEMOLITION", "image_id": image_id},
        ).json()
        assert image_id in report["image_ids"]
        assert report["status"] == "confirmed"

    @patch("backend.api.v1.images.analyze_image_with_claude")
    def test_ai_category_copied_to_report_on_create(self, mock_analyze, upload_client):
        mock_analyze.return_value = "ROAD_PAVING"
        image_id = _upload_staged(upload_client, jpeg_no_exif()).json()["id"]
        upload_client.post("/api/v1/images/analyze", data={"image_id": image_id})
        report = upload_client.post(
            "/api/v1/reports/",
            json={"description": "x", "final_category": "ROAD_PAVING", "image_id": image_id},
        ).json()
        assert report["ai_category"] == "ROAD_PAVING"

    def test_create_report_with_already_linked_image_returns_409(self, upload_client):
        image_id = _upload_staged(upload_client, jpeg_no_exif()).json()["id"]
        upload_client.post(
            "/api/v1/reports/",
            json={"description": "x", "final_category": "OTHER", "image_id": image_id},
        )
        second = upload_client.post(
            "/api/v1/reports/",
            json={"description": "y", "final_category": "OTHER", "image_id": image_id},
        )
        assert second.status_code == 409

    def test_create_report_with_nonexistent_image_returns_404(self, upload_client):
        resp = upload_client.post(
            "/api/v1/reports/",
            json={"description": "x", "final_category": "OTHER", "image_id": "no-such-image"},
        )
        assert resp.status_code == 404

    def test_confirmed_create_requires_description(self, upload_client):
        resp = upload_client.post(
            "/api/v1/reports/",
            json={"description": "", "final_category": "OTHER"},
        )
        assert resp.status_code == 422

    def test_delete_staged_image(self, upload_client):
        image_id = _upload_staged(upload_client, jpeg_no_exif()).json()["id"]
        resp = upload_client.delete(f"/api/v1/images/{image_id}")
        assert resp.status_code == 204
        assert upload_client.get(f"/api/v1/images/{image_id}").status_code == 404

    def test_cannot_delete_linked_image(self, upload_client):
        image_id = _upload_staged(upload_client, jpeg_no_exif()).json()["id"]
        upload_client.post(
            "/api/v1/reports/",
            json={"description": "x", "final_category": "OTHER", "image_id": image_id},
        )
        resp = upload_client.delete(f"/api/v1/images/{image_id}")
        assert resp.status_code == 409


# ── Orphan-image reaper ───────────────────────────────────────────────────────

class TestOrphanReaper:
    def _make_image(self, db, storage, *, report_id, age_hours, name):
        from datetime import datetime, timedelta, timezone
        from backend.models.image import Image as ImageModel

        img = ImageModel(
            report_id=report_id,
            file_path=storage.save(name, b"data"),
            original_filename=name,
            has_exif=False,
            uploaded_at=datetime.now(timezone.utc) - timedelta(hours=age_hours),
        )
        db.add(img)
        db.commit()
        return img

    def test_reaps_old_orphan_and_removes_file(self, db, tmp_path):
        from datetime import timedelta
        from backend.models.image import Image as ImageModel
        from backend.services.image_cleanup import delete_orphan_images

        storage = LocalStorageProvider(tmp_path)
        img = self._make_image(db, storage, report_id=None, age_hours=48, name="old.jpg")
        file_path = img.file_path

        removed = delete_orphan_images(db, storage, timedelta(hours=24))
        assert removed == 1
        assert db.query(ImageModel).count() == 0
        assert not Path(file_path).exists()

    def test_keeps_recent_orphan_and_linked_image(self, db, tmp_path):
        from datetime import timedelta
        from backend.models.image import Image as ImageModel
        from backend.services.image_cleanup import delete_orphan_images

        storage = LocalStorageProvider(tmp_path)
        self._make_image(db, storage, report_id=None, age_hours=1, name="recent.jpg")
        self._make_image(db, storage, report_id="some-report", age_hours=48, name="linked.jpg")

        removed = delete_orphan_images(db, storage, timedelta(hours=24))
        assert removed == 0
        assert db.query(ImageModel).count() == 2
