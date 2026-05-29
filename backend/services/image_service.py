"""
Image handling helpers — EXIF extraction, metadata flagging, size and format validation.

All functions are pure (no side effects, no I/O beyond in-memory Pillow ops) so
they are fully unit-testable without a real file system or database.
The actual file I/O and DB persistence happen in the images router (Stage 4).
"""

import io
from typing import Any

from PIL import Image as PILImage

# ── Limits & accepted formats ─────────────────────────────────────────────────

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB — enforced before any disk write
SUPPORTED_FORMATS = {"JPEG", "PNG", "TIFF"}

# ── EXIF tag constants ────────────────────────────────────────────────────────
# Using raw integer IDs so we have zero dependency on PIL.ExifTags ordering.

_GPS_IFD_TAG = 34853       # Main IFD pointer to the GPS sub-IFD
_EXIF_IFD_TAG = 34665      # Main IFD pointer to the Exif sub-IFD
_DATETIME_ORIGINAL_TAG = 36867  # Exif IFD: capture timestamp (legally significant)
_MAKE_TAG = 271            # Device manufacturer
_MODEL_TAG = 272           # Device model


# ── Public API ────────────────────────────────────────────────────────────────

def extract_exif(image_bytes: bytes) -> dict[str, Any] | None:
    """
    Extract raw EXIF metadata from image bytes into a JSON-serialisable dict.

    Tag IDs are converted to strings (for JSON key compatibility).
    The GPS sub-IFD is extracted separately under the key 'gps_ifd' so
    that callers can access location data without tag-ID lookups.

    Returns None if:
      - the image has no EXIF block
      - the image format does not support EXIF (e.g. PNG)
      - parsing fails for any reason (corrupt data, truncated file)

    Never raises — callers must treat None as 'no metadata available'.
    """
    try:
        img = PILImage.open(io.BytesIO(image_bytes))
        exif = img.getexif()
        if not exif:
            return None

        result: dict[str, Any] = {str(tag): str(val) for tag, val in exif.items()}

        # GPS lives in a sub-IFD; pull it out for structured access.
        gps_ifd = exif.get_ifd(_GPS_IFD_TAG)
        if gps_ifd:
            result["gps_ifd"] = {str(k): str(v) for k, v in gps_ifd.items()}

        return result if result else None
    except Exception:
        return None


def exif_has_legal_metadata(image_bytes: bytes) -> bool:
    """
    Return True when the image contains at least one legally significant EXIF field.

    Qualifying fields:
      - GPS coordinates (any entry in the GPS sub-IFD)
      - DateTimeOriginal (the moment the shutter fired, not the file date)

    Device make/model alone do NOT qualify — they establish the device but
    not the time or place of capture, which are the fields that matter in court.
    """
    try:
        img = PILImage.open(io.BytesIO(image_bytes))
        exif = img.getexif()
        if not exif:
            return False

        # GPS: presence of any entry in the GPS sub-IFD is sufficient.
        gps_ifd = exif.get_ifd(_GPS_IFD_TAG)
        if gps_ifd:
            return True

        # DateTimeOriginal lives in the Exif sub-IFD; check there first,
        # then fall back to the main IFD in case a camera wrote it flat.
        exif_ifd = exif.get_ifd(_EXIF_IFD_TAG)
        return _DATETIME_ORIGINAL_TAG in exif_ifd or _DATETIME_ORIGINAL_TAG in exif
    except Exception:
        return False


def validate_image_size(image_bytes: bytes) -> None:
    """
    Raise ValueError if the payload exceeds MAX_IMAGE_BYTES.

    Called before any disk write to prevent storage exhaustion from
    large or deliberately oversized uploads.
    """
    size = len(image_bytes)
    if size > MAX_IMAGE_BYTES:
        limit_mb = MAX_IMAGE_BYTES // (1024 * 1024)
        raise ValueError(
            f"גודל התמונה {size:,} בייטים חורג מהמגבלה של {limit_mb} MB."
        )


def validate_image_format(image_bytes: bytes) -> str:
    """
    Confirm the bytes are a supported, non-corrupt image.

    Returns the format string (e.g. 'JPEG', 'PNG', 'TIFF').
    Raises ValueError for unsupported formats or unreadable content.
    """
    try:
        img = PILImage.open(io.BytesIO(image_bytes))
        fmt = img.format
    except Exception as exc:
        raise ValueError(f"לא ניתן לקרוא את התמונה: {exc}") from exc

    if fmt not in SUPPORTED_FORMATS:
        raise ValueError(
            f"פורמט לא נתמך '{fmt}'. פורמטים מותרים: {', '.join(sorted(SUPPORTED_FORMATS))}."
        )
    return fmt
