"""
Email sending.

Two transports behind one interface so callers (the complaint flow) never
change:

  * Resend HTTPS API (preferred) — works on hosts that block outbound SMTP
    ports (e.g. Render). Used automatically when RESEND_API_KEY is set.
  * SMTP via stdlib smtplib (fallback) — for local/dev or self-hosting where
    port 587 is open.

send_email raises on any failure; the complaint endpoint catches per-recipient
so one bad address doesn't abort the rest.
"""

import base64
import json
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

from backend.core.config import settings

# (filename, mime_type, data) tuples.
Attachment = tuple[str, str, bytes]


def send_email(
    to: str,
    subject: str,
    body: str,
    attachments: list[Attachment] | None = None,
) -> None:
    """Send a plain-text email with optional attachments via the active transport."""
    attachments = attachments or []
    if settings.RESEND_API_KEY:
        _send_via_resend(to, subject, body, attachments)
    else:
        _send_via_smtp(to, subject, body, attachments)


def _send_via_resend(to: str, subject: str, body: str, attachments: list[Attachment]) -> None:
    """POST to the Resend API over HTTPS (port 443)."""
    payload: dict = {
        "from": settings.RESEND_FROM,
        "to": [to],
        "subject": subject,
        "text": body,
    }
    if attachments:
        payload["attachments"] = [
            {"filename": filename, "content": base64.b64encode(data).decode("ascii")}
            for filename, _mime, data in attachments
        ]

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
            # Resend sits behind Cloudflare, which bans the default urllib
            # User-Agent (403 "error code: 1010"). Send a normal UA.
            "User-Agent": "regavim-backend/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Resend API error {exc.code}: {detail}") from exc


def _send_via_smtp(to: str, subject: str, body: str, attachments: list[Attachment]) -> None:
    """Send via SMTP (stdlib). Used when no RESEND_API_KEY is configured."""
    if not settings.SMTP_HOST or not settings.SENDER_EMAIL:
        raise RuntimeError("שירות הדוא״ל אינו מוגדר (RESEND_API_KEY או SMTP_HOST / SENDER_EMAIL).")

    msg = EmailMessage()
    msg["From"] = settings.SENDER_EMAIL
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    for filename, mime, data in attachments:
        maintype, _, subtype = mime.partition("/")
        msg.add_attachment(
            data,
            maintype=maintype or "application",
            subtype=subtype or "octet-stream",
            filename=filename,
        )

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)
