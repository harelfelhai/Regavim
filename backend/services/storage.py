"""
Storage provider abstraction.

The upload endpoint depends on StorageProvider via FastAPI's dependency
injection. To switch from local disk to Cloudinary, set the three
CLOUDINARY_* env vars — get_storage() in images.py picks the right
provider automatically.

Implementations:
  LocalStorageProvider     — saves to a configurable local directory (dev/test)
  CloudinaryStorageProvider — uploads to Cloudinary CDN (production)
"""

import urllib.request
from abc import ABC, abstractmethod
from pathlib import Path


class StorageProvider(ABC):
    """
    Contract that all storage backends must satisfy.

    file_path semantics:
      LocalStorageProvider  — absolute filesystem path string
      CloudinaryStorageProvider — Cloudinary public_id string

    The string stored in Image.file_path is opaque to callers; always go
    through the provider methods rather than interpreting the value directly.
    """

    @abstractmethod
    def save(self, filename: str, data: bytes) -> str:
        """
        Persist data under filename and return an opaque path/key string.
        The returned value is stored verbatim in Image.file_path.
        """

    @abstractmethod
    def delete(self, path: str) -> None:
        """Remove a previously stored file. Silently no-ops if already gone."""

    @abstractmethod
    def read(self, path: str) -> bytes:
        """
        Return the raw bytes of a stored file.
        Raises FileNotFoundError if the resource does not exist.
        """

    @abstractmethod
    def public_url(self, path: str) -> str | None:
        """
        Return a publicly accessible URL for the resource, or None.

        None means the file can only be served through the backend (local dev).
        A non-None value means the frontend can be redirected straight to CDN.
        """


class LocalStorageProvider(StorageProvider):
    """
    Stores files in a local directory (development and tests).

    The directory is created on first use if it does not exist.
    Filenames are expected to be collision-free (callers use UUID-based names).
    """

    def __init__(self, upload_dir: Path) -> None:
        self._dir = upload_dir
        self._dir.mkdir(parents=True, exist_ok=True)

    def save(self, filename: str, data: bytes) -> str:
        dest = self._dir / filename
        dest.write_bytes(data)
        return str(dest.resolve())

    def delete(self, path: str) -> None:
        target = Path(path)
        if target.exists():
            target.unlink()

    def read(self, path: str) -> bytes:
        target = Path(path)
        if not target.exists():
            raise FileNotFoundError(f"Image file not found: {path}")
        return target.read_bytes()

    def public_url(self, path: str) -> str | None:
        return None


class CloudinaryStorageProvider(StorageProvider):
    """
    Stores images on Cloudinary (production).

    Image.file_path holds the Cloudinary public_id (not a URL).
    URLs are derived on demand via cloudinary.utils.cloudinary_url().

    Credentials are set once at construction time via cloudinary.config();
    all subsequent SDK calls in this process use the same config.
    """

    def __init__(self, cloud_name: str, api_key: str, api_secret: str) -> None:
        import cloudinary
        import cloudinary.uploader
        import cloudinary.utils

        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True,
        )
        self._cloudinary = cloudinary

    def save(self, filename: str, data: bytes) -> str:
        public_id = Path(filename).stem  # UUID without extension, no collision risk
        result = self._cloudinary.uploader.upload(
            data,
            public_id=public_id,
            resource_type="image",
            overwrite=False,
        )
        return result["public_id"]

    def delete(self, path: str) -> None:
        try:
            self._cloudinary.uploader.destroy(path, resource_type="image")
        except Exception:
            pass

    def read(self, path: str) -> bytes:
        url, _ = self._cloudinary.utils.cloudinary_url(path, resource_type="image", secure=True)
        try:
            with urllib.request.urlopen(url) as resp:
                return resp.read()
        except Exception as exc:
            raise FileNotFoundError(f"Could not fetch image from Cloudinary: {exc}") from exc

    def public_url(self, path: str) -> str | None:
        url, _ = self._cloudinary.utils.cloudinary_url(path, resource_type="image", secure=True)
        return url
