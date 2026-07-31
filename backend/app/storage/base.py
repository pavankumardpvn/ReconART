"""Abstract storage backend interface."""

from abc import ABC, abstractmethod


class StorageBackend(ABC):
    """Abstract base class for file storage backends.

    Every concrete backend (local, S3, GCS, ...) must implement these four
    methods so the rest of the application can store and retrieve files
    without knowing the underlying storage mechanism.
    """

    @abstractmethod
    async def save(self, tenant_id: str, filename: str, content: bytes) -> str:
        """Persist *content* and return the canonical storage path.

        Args:
            tenant_id: Tenant identifier used for namespacing.
            filename: Original (or logical) filename.
            content: Raw file bytes.

        Returns:
            A string path or key that can later be passed to ``read``,
            ``delete``, or ``exists``.
        """

    @abstractmethod
    async def read(self, path: str) -> bytes:
        """Return the raw bytes stored at *path*.

        Raises:
            FileNotFoundError: If *path* does not exist.
        """

    @abstractmethod
    async def delete(self, path: str) -> None:
        """Remove the object at *path*.

        This is idempotent -- deleting a non-existent path should not raise.
        """

    @abstractmethod
    async def exists(self, path: str) -> bool:
        """Return ``True`` if an object exists at *path*."""
