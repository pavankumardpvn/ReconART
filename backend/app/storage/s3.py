"""AWS S3 (or S3-compatible) storage backend.

boto3 is an optional dependency. If it is not installed the backend raises a
clear error at construction time rather than failing with an obscure import
error at runtime.
"""

import uuid

from app.config import settings
from app.storage.base import StorageBackend


class S3StorageBackend(StorageBackend):
    """Store files on AWS S3 or any S3-compatible service (e.g. MinIO).

    Configuration is read from ``app.config.settings``:

    - ``s3_bucket``       -- target bucket name
    - ``s3_region``       -- AWS region (e.g. ``us-east-1``)
    - ``s3_access_key``   -- AWS access key id
    - ``s3_secret_key``   -- AWS secret access key
    - ``s3_endpoint_url`` -- (optional) custom endpoint for S3-compatible services
    """

    def __init__(self) -> None:
        try:
            import boto3  # noqa: F401
        except ImportError:
            raise RuntimeError(
                "boto3 is required for S3 storage. "
                "Install it with: pip install boto3"
            )

        if not settings.s3_bucket:
            raise ValueError(
                "S3 storage is enabled but s3_bucket is not configured. "
                "Set the S3_BUCKET environment variable."
            )

        self.bucket = settings.s3_bucket
        self.region = settings.s3_region or None
        self.endpoint_url = settings.s3_endpoint_url or None

        session_kwargs: dict = {}
        if settings.s3_access_key and settings.s3_secret_key:
            session_kwargs["aws_access_key_id"] = settings.s3_access_key
            session_kwargs["aws_secret_access_key"] = settings.s3_secret_key
        if self.region:
            session_kwargs["region_name"] = self.region

        import boto3

        self._session = boto3.Session(**session_kwargs)
        client_kwargs: dict = {}
        if self.endpoint_url:
            client_kwargs["endpoint_url"] = self.endpoint_url

        self._client = self._session.client("s3", **client_kwargs)

    def _key(self, tenant_id: str, filename: str) -> str:
        """Build an S3 object key: ``{tenant_id}/{filename}``.

        If a file with the same name already exists, a timestamp suffix
        is appended to avoid overwriting (e.g. ``report_20260803_143052.csv``).
        """
        from datetime import datetime, timezone
        from pathlib import PurePosixPath

        safe_name = PurePosixPath(filename).name
        key = f"{tenant_id}/{safe_name}"

        if self._object_exists(key):
            stem = PurePosixPath(safe_name).stem
            ext = PurePosixPath(safe_name).suffix or ""
            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            key = f"{tenant_id}/{stem}_{ts}{ext}"

        return key

    def _object_exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    async def save(self, tenant_id: str, filename: str, content: bytes) -> str:
        """Upload *content* to S3 and return the object key."""
        key = self._key(tenant_id, filename)
        self._client.put_object(Bucket=self.bucket, Key=key, Body=content)
        return key

    async def read(self, path: str) -> bytes:
        """Download and return the bytes stored at *path* (S3 object key)."""
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=path)
            return response["Body"].read()
        except self._client.exceptions.NoSuchKey:
            raise FileNotFoundError(f"S3 object not found: {path}")
        except Exception as exc:
            raise FileNotFoundError(f"Failed to read S3 object '{path}': {exc}")

    async def delete(self, path: str) -> None:
        """Delete the S3 object at *path*. Idempotent."""
        try:
            self._client.delete_object(Bucket=self.bucket, Key=path)
        except Exception:
            pass  # idempotent

    async def exists(self, path: str) -> bool:
        """Return ``True`` if an object exists at *path* in the bucket."""
        try:
            self._client.head_object(Bucket=self.bucket, Key=path)
            return True
        except Exception:
            return False
