"""
Email sending via SMTP (stdlib only).

A thin wrapper so callers don't deal with smtplib directly and so the transport
can later be swapped (SendGrid/Resend/SES) without touching the complaint flow.
send_email raises on any failure; the complaint endpoint catches per-recipient
so one bad address doesn't abort the rest.
"""

import smtplib
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
    """
    Send a plain-text email with optional file attachments.

    Raises RuntimeError if SMTP isn't configured, or any smtplib error on
    connection/auth/send failure.
    """
    if not settings.SMTP_HOST or not settings.SENDER_EMAIL:
        raise RuntimeError("שירות הדוא״ל אינו מוגדר (SMTP_HOST / SENDER_EMAIL).")

    msg = EmailMessage()
    msg["From"] = settings.SENDER_EMAIL
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    for filename, mime, data in attachments or []:
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
