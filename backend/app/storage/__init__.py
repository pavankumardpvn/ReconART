"""Storage backend factory.

Returns the configured storage backend (local or S3/R2) based on
the ``STORAGE_BACKEND`` environment variable.
"""

from app.config import settings
from app.storage.base import StorageBackend


def get_storage() -> StorageBackend:
    if settings.storage_backend == "s3":
        from app.storage.s3 import S3StorageBackend
        return S3StorageBackend()

    from app.storage.local import LocalStorageBackend
    return LocalStorageBackend()
