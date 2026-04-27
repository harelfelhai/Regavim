"""
Claude AI integration for image violation classification.

Public surface:
  analyze_image_with_claude(image_bytes, media_type) -> str | None

Design principles:
  - All errors are caught and return None — the caller decides what to do
  - The Claude client is created via _get_client() so tests can mock it cleanly
  - _parse_category() is exposed so it can be unit-tested independently
  - max_tokens=32 caps cost and prevents verbose non-category responses
"""

import base64

import anthropic

from backend.core.config import settings
from backend.core.constants import ViolationCategory

# ── Constants ─────────────────────────────────────────────────────────────────

_API_TIMEOUT = 30.0  # seconds before raising APITimeoutError

# Claude vision API only accepts these media types.
# TIFF is a valid evidence format but cannot be sent to Claude directly.
_CLAUDE_SUPPORTED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

_MODEL = "claude-sonnet-4-6"

_CATEGORY_LIST = "\n".join(f"- {c.value}" for c in ViolationCategory)

_SYSTEM_PROMPT = f"""\
You are a land-use violation analyst for an environmental NGO field-monitoring system.

Your task: examine the image and classify the violation into exactly ONE of the categories below.

Valid categories:
{_CATEGORY_LIST}

Rules:
- Reply with ONLY the category name, exactly as it appears in the list above.
- No punctuation, no explanation, no additional words.
- If the image is ambiguous or matches no category, reply with: OTHER
"""


# ── Public API ────────────────────────────────────────────────────────────────

def analyze_image_with_claude(
    image_bytes: bytes,
    media_type: str = "image/jpeg",
) -> str | None:
    """
    Send an image to Claude and return a ViolationCategory value string.

    The response is validated against the ViolationCategory enum.
    If the AI returns text that is not a known category, None is returned —
    the caller should treat this the same as a timeout or API error.

    Returns:
        A ViolationCategory value (e.g. 'ILLEGAL_CONSTRUCTION') on success.
        None on timeout, API error, unsupported media type, or unrecognised response.

    Never raises.
    """
    if media_type not in _CLAUDE_SUPPORTED_MEDIA_TYPES:
        # TIFF and other non-Claude-vision formats degrade silently.
        return None

    try:
        client = _get_client()
        image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

        message = client.messages.create(
            model=_MODEL,
            max_tokens=32,
            system=_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": "Classify this image into one of the defined violation categories.",
                        },
                    ],
                }
            ],
        )

        raw = message.content[0].text if message.content else ""
        return _parse_category(raw)

    except anthropic.APITimeoutError:
        # Expected under poor field connectivity — degrade gracefully.
        return None
    except Exception:
        # Rate limit, auth error, network failure, etc. — never crash the upload.
        return None


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_client() -> anthropic.Anthropic:
    """
    Instantiate the Anthropic SDK client.
    Extracted into its own function so tests can patch it without
    replacing the entire anthropic module.
    """
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=_API_TIMEOUT)


def _parse_category(raw: str) -> str | None:
    """
    Validate the raw AI response against the ViolationCategory enum.

    Normalises case and common separator variations so minor model
    formatting differences (e.g. spaces instead of underscores) don't
    cause false negatives.

    Returns the canonical category string or None if unrecognised.
    """
    if not raw:
        return None

    cleaned = raw.strip().upper().replace(" ", "_").replace("-", "_")

    try:
        return ViolationCategory(cleaned).value
    except ValueError:
        return None
