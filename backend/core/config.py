"""
Application settings loaded from environment variables or a .env file.
All configuration lives here — never hardcode values elsewhere.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database — SQLite for local dev, PostgreSQL for production.
    # Switch by setting DATABASE_URL in the environment or .env file.
    DATABASE_URL: str = "sqlite:///./regavim.db"

    # Local upload directory. Relative paths are resolved from the working directory.
    # For production, swap LocalStorageProvider for S3StorageProvider instead.
    UPLOAD_DIR: str = "uploads"

    # Anthropic Claude API key for image analysis.
    ANTHROPIC_API_KEY: str = ""

    # JWT — generate a strong secret with:
    #   python -c "import secrets; print(secrets.token_hex(32))"
    SECRET_KEY: str = "change-me-before-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours


settings = Settings()
