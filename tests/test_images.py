"""
Stage 4 integration and unit tests — image upload pipeline.

Test matrix:
  Happy path       — JPEG with full GPS + timestamp EXIF → has_exif True
  No-EXIF cases    — plain JPEG, PNG, JPEG with make/model only → has_exif False
  Anomalies        — corrupt bytes, oversized file, path traversal filename
  Concurrency      — 5 simultaneous uploads to same report, all unique IDs
  Service units    — exif_has_legal_metadata() logic in isolation

Image fixtures use piexif to inject controlled EXIF data so tests are
deterministic and don't rely on external image files.
"""

import io
import threading
from pathlib import Path

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
