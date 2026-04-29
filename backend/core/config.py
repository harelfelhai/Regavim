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

    # Anthropic Claude API key for image analysis.
    ANTHROPIC_API_KEY: str = ""

    # JWT — generate a strong secret with:
    #   python -c "import secrets; print(secrets.token_hex(32))"
    SECRET_KEY: str = "change-me-before-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # CORS — comma-separated list of allowed origins, or "*" to allow all.
    # In production, set to the exact frontend URL, e.g.:
    #   ALLOWED_ORIGINS=https://regavim.vercel.app
    ALLOWED_ORIGINS: str = "*"


settings = Settings()
