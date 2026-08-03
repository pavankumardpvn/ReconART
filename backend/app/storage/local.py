"""Local filesystem storage backend."""

import uuid
from pathlib import Path

import aiofiles

from app.config import settings
from app.storage.base import StorageBackend


class LocalStorageBackend(StorageBackend):
    """Store files on the local filesystem under ``settings.storage_path``.

    Files are organized as ``<storage_path>/<tenant_id>/<uuid>.<ext>`` to
    prevent filename collisions and path-traversal attacks.
    """

    def __init__(self) -> None:
        self.base_path = Path(settings.storage_path).resolve()

    def _tenant_dir(self, tenant_id: str) -> Path:
        """Return the tenant-specific directory, creating it if needed."""
        # Guard against path traversal in tenant_id
        safe_tenant = tenant_id.replace("/", "").replace("\\", "").replace("..", "")
        tenant_dir = self.base_path / safe_tenant
        tenant_dir.mkdir(parents=True, exist_ok=True)
        return tenant_dir

    def _safe_path(self, path_str: str) -> Path:
        """Resolve *path_str* and ensure it lives under ``base_path``."""
        resolved = (self.base_path / path_str).resolve()
        if not str(resolved).startswith(str(self.base_path)):
            raise PermissionError(f"Path traversal detected: {path_str}")
        return resolved

    async def save(self, tenant_id: str, filename: str, content: bytes) -> str:
        """Save *content* using the original filename.

        If a file with the same name already exists a timestamp suffix is
        appended to avoid overwriting (e.g. ``report_20260803_143052.csv``).
        """
        from datetime import datetime, timezone

        tenant_dir = self._tenant_dir(tenant_id)

        safe_name = Path(filename).name
        file_path = tenant_dir / safe_name

        if file_path.exists():
            stem = Path(safe_name).stem
            ext = Path(safe_name).suffix or ""
            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            file_path = tenant_dir / f"{stem}_{ts}{ext}"

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)

        # Return a relative path (relative to base_path) for portability
        return str(file_path.relative_to(self.base_path))

    async def read(self, path: str) -> bytes:
        """Read and return bytes from the stored path."""
        full_path = self._safe_path(path)
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        async with aiofiles.open(full_path, "rb") as f:
            return await f.read()

    async def delete(self, path: str) -> None:
        """Delete the file at *path*. No-op if it does not exist."""
        full_path = self._safe_path(path)
        if full_path.exists():
            full_path.unlink()

    async def exists(self, path: str) -> bool:
        """Check whether a file exists at *path*."""
        full_path = self._safe_path(path)
        return full_path.exists()
