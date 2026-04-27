"""
Unit tests for the Claude AI service — all API calls are mocked.

No live Anthropic API key is needed or used. Tests verify:
  - _parse_category(): normalisation, all 7 valid categories, rejection of invalid input
  - analyze_image_with_claude(): correct client call, graceful degradation on every
    failure mode (timeout, invalid response, empty response, API error, unsupported format)
  - The model name sent to the API is the agreed production model
"""

import io
from unittest.mock import MagicMock, patch

import anthropic
import httpx
import pytest
from PIL import Image as PILImage

from backend.core.constants import ViolationCategory
from backend.services.ai_service import _parse_category, analyze_image_with_claude, _MODEL


# ── Helpers ───────────────────────────────────────────────────────────────────

def _jpeg() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (32, 32)).save(buf, "JPEG")
    return buf.getvalue()


def _png() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (32, 32)).save(buf, "PNG")
    return buf.getvalue()


def _tiff() -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (32, 32)).save(buf, "TIFF")
    return buf.getvalue()


def _mock_client(response_text: str) -> MagicMock:
    """Build a mock Anthropic client that returns response_text as the AI message."""
    client = MagicMock()
    content_block = MagicMock()
    content_block.text = response_text
    client.messages.create.return_value.content = [content_block]
    return client


def _timeout_error() -> anthropic.APITimeoutError:
    """Construct a real APITimeoutError for testing timeout handling."""
    return anthropic.APITimeoutError(
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    )


# ── _parse_category unit tests ────────────────────────────────────────────────

class TestParseCategory:
    def test_exact_match_returned(self):
        assert _parse_category("ILLEGAL_CONSTRUCTION") == "ILLEGAL_CONSTRUCTION"

    def test_all_seven_categories_accepted(self):
        for cat in ViolationCategory:
            assert _parse_category(cat.value) == cat.value, f"Failed for {cat.value}"

    def test_lowercase_normalised_to_uppercase(self):
        assert _parse_category("illegal_construction") == "ILLEGAL_CONSTRUCTION"

    def test_mixed_case_normalised(self):
        assert _parse_category("Illegal_Construction") == "ILLEGAL_CONSTRUCTION"

    def test_spaces_converted_to_underscores(self):
        assert _parse_category("ROAD PAVING") == "ROAD_PAVING"

    def test_hyphens_converted_to_underscores(self):
        assert _parse_category("ROAD-PAVING") == "ROAD_PAVING"

    def test_leading_trailing_whitespace_stripped(self):
        assert _parse_category("  DEMOLITION  ") == "DEMOLITION"

    def test_trailing_newline_stripped(self):
        # Claude occasionally appends a trailing newline.
        assert _parse_category("ILLEGAL_DUMPING\n") == "ILLEGAL_DUMPING"

    def test_empty_string_returns_none(self):
        assert _parse_category("") is None

    def test_unknown_category_returns_none(self):
        assert _parse_category("FENCE_INSTALLATION") is None

    def test_partial_category_name_returns_none(self):
        assert _parse_category("ILLEGAL") is None

    def test_full_sentence_response_returns_none(self):
        # If Claude ignores the instruction and gives an explanation:
        assert _parse_category("The image shows an illegal construction site.") is None

    def test_number_string_returns_none(self):
        assert _parse_category("1") is None

    def test_other_is_valid_category(self):
        assert _parse_category("OTHER") == "OTHER"


# ── analyze_image_with_claude unit tests ──────────────────────────────────────

class TestAnalyzeImageWithClaude:

    @patch("backend.services.ai_service._get_client")
    def test_happy_path_returns_valid_category(self, mock_get_client):
        mock_get_client.return_value = _mock_client("ILLEGAL_CONSTRUCTION")
        assert analyze_image_with_claude(_jpeg()) == "ILLEGAL_CONSTRUCTION"

    @patch("backend.services.ai_service._get_client")
    def test_all_seven_categories_round_trip(self, mock_get_client):
        for cat in ViolationCategory:
            mock_get_client.return_value = _mock_client(cat.value)
            result = analyze_image_with_claude(_jpeg())
            assert result == cat.value, f"Category {cat.value} did not round-trip"

    @patch("backend.services.ai_service._get_client")
    def test_timeout_returns_none(self, mock_get_client):
        mock_get_client.return_value.messages.create.side_effect = _timeout_error()
        assert analyze_image_with_claude(_jpeg()) is None

    @patch("backend.services.ai_service._get_client")
    def test_invalid_category_in_response_returns_none(self, mock_get_client):
        mock_get_client.return_value = _mock_client("FENCE_BUILDING")
        assert analyze_image_with_claude(_jpeg()) is None

    @patch("backend.services.ai_service._get_client")
    def test_verbose_explanation_response_returns_none(self, mock_get_client):
        mock_get_client.return_value = _mock_client(
            "Based on the image, I believe this is an illegal construction."
        )
        assert analyze_image_with_claude(_jpeg()) is None

    @patch("backend.services.ai_service._get_client")
    def test_empty_content_list_returns_none(self, mock_get_client):
        mock_get_client.return_value.messages.create.return_value.content = []
        assert analyze_image_with_claude(_jpeg()) is None

    @patch("backend.services.ai_service._get_client")
    def test_api_error_returns_none(self, mock_get_client):
        mock_get_client.return_value.messages.create.side_effect = Exception(
            "502 Bad Gateway"
        )
        assert analyze_image_with_claude(_jpeg()) is None

    @patch("backend.services.ai_service._get_client")
    def test_correct_model_sent_to_api(self, mock_get_client):
        mock_get_client.return_value = _mock_client("OTHER")
        analyze_image_with_claude(_jpeg())
        call_kwargs = mock_get_client.return_value.messages.create.call_args.kwargs
        assert call_kwargs["model"] == _MODEL

    @patch("backend.services.ai_service._get_client")
    def test_max_tokens_is_small(self, mock_get_client):
        """Verify we cap tokens to prevent verbose/costly responses."""
        mock_get_client.return_value = _mock_client("OTHER")
        analyze_image_with_claude(_jpeg())
        call_kwargs = mock_get_client.return_value.messages.create.call_args.kwargs
        assert call_kwargs["max_tokens"] <= 64

    @patch("backend.services.ai_service._get_client")
    def test_png_image_accepted(self, mock_get_client):
        mock_get_client.return_value = _mock_client("DEMOLITION")
        assert analyze_image_with_claude(_png(), media_type="image/png") == "DEMOLITION"

    def test_tiff_skips_api_call_and_returns_none(self):
        """TIFF is not supported by Claude vision — must return None without calling API."""
        with patch("backend.services.ai_service._get_client") as mock_get_client:
            result = analyze_image_with_claude(_tiff(), media_type="image/tiff")
        assert result is None
        mock_get_client.assert_not_called()

    @patch("backend.services.ai_service._get_client")
    def test_default_media_type_is_jpeg(self, mock_get_client):
        mock_get_client.return_value = _mock_client("LAND_GRADING")
        result = analyze_image_with_claude(_jpeg())  # no media_type arg
        call_kwargs = mock_get_client.return_value.messages.create.call_args.kwargs
        image_source = call_kwargs["messages"][0]["content"][0]["source"]
        assert image_source["media_type"] == "image/jpeg"
        assert result == "LAND_GRADING"
