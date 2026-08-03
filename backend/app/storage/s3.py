"""AWS S3 (or S3-compatible) storage backend.

boto3 is an optional dependency. If it is not installed the backend raises a
clear error at construction time rather than failing with an obscure import
error at runtime.
"""

import asyncio
import functools
from datetime import datetime, timezone
from pathlib import PurePosixPath

from app.config import settings
from app.storage.base import StorageBackend


class S3StorageBackend(StorageBackend):
    """Store files on AWS S3 or any S3-compatible service (e.g. Cloudflare R2).

    All boto3 calls are offloaded to a thread pool via ``run_in_executor``
    so they never block the async event loop.
    """

    def __init__(self) -> None:
        try:
            import boto3
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

        self._session = boto3.Session(**session_kwargs)
        client_kwargs: dict = {}
        if self.endpoint_url:
            client_kwargs["endpoint_url"] = self.endpoint_url

        self._client = self._session.client("s3", **client_kwargs)

    async def _run(self, func, *args, **kwargs):
        """Run a synchronous boto3 call in a thread pool."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, functools.partial(func, *args, **kwargs)
        )

    def _key(self, tenant_id: str, filename: str) -> str:
        safe_name = PurePosixPath(filename).name
        key = f"{tenant_id}/{safe_name}"

        try:
            self._client.head_object(Bucket=self.bucket, Key=key)
            stem = PurePosixPath(safe_name).stem
            ext = PurePosixPath(safe_name).suffix or ""
            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            key = f"{tenant_id}/{stem}_{ts}{ext}"
        except Exception:
            pass

        return key

    async def save(self, tenant_id: str, filename: str, content: bytes) -> str:
        key = await self._run(self._key, tenant_id, filename)
        await self._run(
            self._client.put_object, Bucket=self.bucket, Key=key, Body=content
        )
        return key

    async def read(self, path: str) -> bytes:
        try:
            response = await self._run(
                self._client.get_object, Bucket=self.bucket, Key=path
            )
            return await self._run(response["Body"].read)
        except Exception as exc:
            raise FileNotFoundError(f"S3 object not found: {path}") from exc

    async def delete(self, path: str) -> None:
        try:
            await self._run(
                self._client.delete_object, Bucket=self.bucket, Key=path
            )
        except Exception:
            pass

    async def exists(self, path: str) -> bool:
        try:
            await self._run(
                self._client.head_object, Bucket=self.bucket, Key=path
            )
            return True
        except Exception:
            return False
