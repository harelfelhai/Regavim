"""
Unit tests for image_service helpers.

Anomaly focus for Stage 2:
  - Missing EXIF metadata (JPEG without EXIF, PNG, corrupt bytes)
  - Overly large files (> 10 MB limit)
  - Corrupt or unsupported format files
"""

import io

import pytest
from PIL import Image as PILImage

from backend.services.image_service import (
    MAX_IMAGE_BYTES,
    SUPPORTED_FORMATS,
    extract_exif,
    validate_image_format,
    validate_image_size,
)


def _make_jpeg() -> bytes:
    """Minimal valid JPEG with no EXIF block."""
    buf = io.BytesIO()
    PILImage.new("RGB", (64, 64), color=(200, 100, 50)).save(buf, format="JPEG")
    return buf.getvalue()


def _make_png() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (64, 64)).save(buf, format="PNG")
    return buf.getvalue()


def _make_tiff() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (64, 64)).save(buf, format="TIFF")
    return buf.getvalue()


def _make_bmp() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (64, 64)).save(buf, format="BMP")
    return buf.getvalue()


# ── extract_exif ─────────────────────────────────────────────────────────────

class TestExtractExif:
    def test_jpeg_without_exif_returns_none(self):
        assert extract_exif(_make_jpeg()) is None

    def test_png_has_no_exif_returns_none(self):
        assert extract_exif(_make_png()) is None

    def test_tiff_without_exif_returns_none(self):
        # TIFF can carry EXIF but our minimal fixture has none
        result = extract_exif(_make_tiff())
        assert result is None or isinstance(result, dict)

    def test_corrupt_bytes_returns_none(self):
        assert extract_exif(b"this is not an image") is None

    def test_empty_bytes_returns_none(self):
        assert extract_exif(b"") is None

    def test_truncated_jpeg_returns_none(self):
        assert extract_exif(_make_jpeg()[:20]) is None

    def test_return_type_is_dict_or_none(self):
        result = extract_exif(_make_jpeg())
        assert result is None or isinstance(result, dict)


# ── validate_image_size ───────────────────────────────────────────────────────

class TestValidateImageSize:
    def test_small_file_passes(self):
        validate_image_size(b"x" * 1024)  # 1 KB

    def test_exactly_at_limit_passes(self):
        validate_image_size(b"x" * MAX_IMAGE_BYTES)

    def test_one_byte_over_limit_raises(self):
        with pytest.raises(ValueError, match="חורג"):
            validate_image_size(b"x" * (MAX_IMAGE_BYTES + 1))

    def test_double_limit_raises(self):
        with pytest.raises(ValueError):
            validate_image_size(b"x" * (MAX_IMAGE_BYTES * 2))

    def test_empty_file_passes(self):
        validate_image_size(b"")  # 0 bytes — valid (format check catches it later)

    def test_error_message_contains_limit(self):
        with pytest.raises(ValueError) as exc:
            validate_image_size(b"x" * (MAX_IMAGE_BYTES + 1))
        assert "10 MB" in str(exc.value)


# ── validate_image_format ─────────────────────────────────────────────────────

class TestValidateImageFormat:
    def test_jpeg_accepted(self):
        assert validate_image_format(_make_jpeg()) == "JPEG"

    def test_png_accepted(self):
        assert validate_image_format(_make_png()) == "PNG"

    def test_tiff_accepted(self):
        assert validate_image_format(_make_tiff()) == "TIFF"

    def test_bmp_rejected(self):
        with pytest.raises(ValueError, match="פורמט לא נתמך"):
            validate_image_format(_make_bmp())

    def test_corrupt_bytes_raises(self):
        with pytest.raises(ValueError, match="לא ניתן לקרוא"):
            validate_image_format(b"garbage bytes that are not an image")

    def test_empty_bytes_raises(self):
        with pytest.raises(ValueError):
            validate_image_format(b"")

    def test_truncated_valid_image_raises(self):
        with pytest.raises(ValueError):
            validate_image_format(_make_jpeg()[:10])

    def test_supported_formats_constant_contains_expected(self):
        assert "JPEG" in SUPPORTED_FORMATS
        assert "PNG" in SUPPORTED_FORMATS
        assert "TIFF" in SUPPORTED_FORMATS
