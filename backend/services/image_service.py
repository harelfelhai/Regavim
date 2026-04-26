"""
Image handling helpers — EXIF extraction, size validation, format validation.

These are pure functions with no side effects so they are fully unit-testable.
The actual file I/O and DB persistence happen in the images router (Stage 4).
"""

import io
from typing import Any

from PIL import Image as PILImage

# Maximum accepted upload size. Enforced before writing to disk.
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB

# Image formats accepted by the system.
SUPPORTED_FORMATS = {"JPEG", "PNG", "TIFF"}


def extract_exif(image_bytes: bytes) -> dict[str, Any] | None:
    """
    Extract EXIF metadata from raw image bytes.

    Returns a flat dict mapping tag IDs (as strings) to their values, or None
    if the image contains no EXIF block or if parsing fails for any reason.
    Never raises — callers must treat a None return as 'no metadata available'
    and proceed accordingly (store the image without EXIF).

    EXIF data is legally significant; this function must never modify or
    truncate the values it reads.
    """
    try:
        img = PILImage.open(io.BytesIO(image_bytes))
        raw = img._getexif()  # type: ignore[attr-defined]
        if raw is None:
            return None
        return {str(tag): str(value) for tag, value in raw.items()}
    except Exception:
        return None


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
            f"Image size {size:,} bytes exceeds the {limit_mb} MB limit."
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
        raise ValueError(f"Cannot read image: {exc}") from exc

    if fmt not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Unsupported format '{fmt}'. Accepted: {', '.join(sorted(SUPPORTED_FORMATS))}."
        )
    return fmt
