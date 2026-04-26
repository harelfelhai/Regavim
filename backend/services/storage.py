"""
Storage provider abstraction.

The upload endpoint depends on StorageProvider via FastAPI's dependency
injection. To switch from local disk to S3, implement S3StorageProvider
and replace the get_storage() binding in images.py — no endpoint code changes.

Current implementations:
  LocalStorageProvider  — saves to a configurable local directory
"""

from abc import ABC, abstractmethod
from pathlib import Path


class StorageProvider(ABC):
    """
    Contract that all storage backends must satisfy.

    save() and delete() are the only operations the upload pipeline needs.
    Future implementations (S3, GCS, Azure Blob) add their own connection
    setup inside __init__ without touching this interface.
    """

    @abstractmethod
    def save(self, filename: str, data: bytes) -> str:
        """
        Persist data under filename and return a resolvable reference.

        For local storage this is an absolute filesystem path.
        For cloud storage this would be a key or pre-signed URL.
        The returned string is stored in Image.file_path.
        """

    @abstractmethod
    def delete(self, path: str) -> None:
        """Remove a previously stored file. Silently no-ops if already gone."""


class LocalStorageProvider(StorageProvider):
    """
    Stores files in a local directory.

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
