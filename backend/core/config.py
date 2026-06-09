"""
Application settings loaded from environment variables or a .env file.
All configuration lives here — never hardcode values elsewhere.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root is three levels up from this file: backend/core/config.py → backend/core → backend → repo root.
# Used to anchor the default SQLite path so it is always absolute, regardless of which
# directory the process is started from.  Without this, `sqlite:///./regavim.db` resolves
# relative to CWD — uvicorn started from the repo root and the create_admin.py script run
# from inside backend/ would each see a DIFFERENT database file.
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database — SQLite for local dev, PostgreSQL for production.
    # Default is an absolute path so the DB location is the same regardless of CWD.
    # Override by setting DATABASE_URL in the environment or .env file.
    DATABASE_URL: str = f"sqlite:///{_REPO_ROOT / 'regavim.db'}"

    # Local upload directory. Relative paths are resolved from the working directory.
    # For production, swap LocalStorageProvider for S3StorageProvider instead.
    UPLOAD_DIR: str = "uploads"

    # JWT — generate a strong secret with:
    #   python -c "import secrets; print(secrets.token_hex(32))"
    SECRET_KEY: str = "change-me-before-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days

    # CORS — comma-separated list of allowed origins, or "*" to allow all.
    # In production, set to the exact frontend URL, e.g.:
    #   ALLOWED_ORIGINS=https://regavim.vercel.app
    ALLOWED_ORIGINS: str = "*"

    # Cloudinary — leave blank to use local disk storage (development).
    # When all three are set, CloudinaryStorageProvider is activated automatically.
    # Obtain from: https://console.cloudinary.com → Settings → API Keys
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # Orphan-image reaper — deletes staged images (uploaded but never linked to a
    # report) older than this many hours. See backend/services/image_cleanup.py.
    ORPHAN_IMAGE_TTL_HOURS: int = 24

    # Set to true ONCE a periodic scheduler (cron / Celery beat / K8s CronJob)
    # has been configured to run backend/cleanup_orphan_images.py in production.
    # While false, the app reaps only on startup and warns loudly on every boot.
    IMAGE_REAPER_SCHEDULED: bool = False

    # ── Email (complaint submission) ─────────────────────────────────────────
    # Preferred transport: Resend HTTPS API (works where outbound SMTP is blocked,
    # e.g. Render). When RESEND_API_KEY is set it is used automatically; otherwise
    # the SMTP settings below are used. RESEND_FROM must be a Resend-verified
    # sender — the shared sandbox "onboarding@resend.dev" works for testing and
    # can only deliver to your own Resend account email until a domain is verified.
    RESEND_API_KEY: str = ""
    RESEND_FROM: str = "onboarding@resend.dev"

    # SMTP fallback (local/dev or hosts where port 587 is open). Leave
    # SMTP_HOST/SENDER_EMAIL blank to disable; the endpoint then records each
    # attempt as 'failed' with a clear "not configured" message.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SENDER_EMAIL: str = ""
    SMTP_USE_TLS: bool = True

    # Recipient email per authority. Blank = that authority is shown disabled in
    # the UI ("אין כתובת מוגדרת"). The NGO must supply real addresses before
    # filing real complaints; use a controlled test inbox until then.
    COMPLAINT_EMAIL_POLICE: str = ""
    COMPLAINT_EMAIL_ILA: str = ""
    COMPLAINT_EMAIL_ENV_MINISTRY: str = ""
    COMPLAINT_EMAIL_LOCAL_PLANNING: str = ""
    COMPLAINT_EMAIL_CIVIL_ADMIN: str = ""


settings = Settings()
