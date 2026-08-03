"""Clerk JWT verification middleware for FastAPI.

Also supports API-key authentication via the ``X-API-Key`` header as an
alternative to JWT Bearer tokens.  When an API key is presented the
middleware validates it against the ``api_keys`` table and sets
``request.state.user_id`` / ``request.state.org_id`` accordingly.
"""

import asyncio
import hashlib
import logging
from typing import Any

import httpx
import jwt
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.config import settings

logger = logging.getLogger(__name__)

# Cached JWKS keys — fetched once and reused
_jwks_cache: dict[str, Any] | None = None
_jwks_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    global _jwks_lock
    if _jwks_lock is None:
        _jwks_lock = asyncio.Lock()
    return _jwks_lock


async def _get_jwks() -> dict[str, Any]:
    """Fetch and cache the JWKS from Clerk. Uses a lock to prevent parallel fetches."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache

    async with _get_lock():
        if _jwks_cache is not None:
            return _jwks_cache
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(settings.clerk_jwks_url)
            response.raise_for_status()
            _jwks_cache = response.json()
            return _jwks_cache


async def warm_jwks_cache() -> None:
    """Pre-warm the JWKS cache at startup."""
    try:
        await _get_jwks()
        logger.info("JWKS cache warmed successfully")
    except Exception as e:
        logger.warning("Failed to pre-warm JWKS cache: %s", e)


def _get_signing_key(jwks: dict[str, Any], token: str) -> jwt.algorithms.RSAAlgorithm:
    """Extract the correct signing key from JWKS based on the token's kid header."""
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

    raise jwt.InvalidTokenError(f"No matching key found for kid: {kid}")


async def _validate_api_key(raw_key: str, request: Request) -> bool:
    """Check an API key against the database and set request.state identity.

    Returns True if the key is valid and active, False otherwise.
    """
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    try:
        from sqlalchemy import select, update
        from sqlalchemy.ext.asyncio import AsyncSession

        from app.database import async_session_factory
        from app.api.v1.api_keys import ApiKey

        async with async_session_factory() as session:
            result = await session.execute(
                select(ApiKey).where(
                    ApiKey.key_hash == key_hash,
                    ApiKey.is_active == True,  # noqa: E712
                )
            )
            api_key = result.scalar_one_or_none()
            if not api_key:
                return False

            # Set identity based on the API key's tenant
            request.state.user_id = f"api_key_{api_key.id}"
            request.state.org_id = None  # resolved later via tenant_id

            # Store tenant_id for downstream tenant resolution
            request.state.api_key_tenant_id = api_key.tenant_id

            # Update last_used_at (best effort)
            from datetime import datetime, timezone

            await session.execute(
                update(ApiKey)
                .where(ApiKey.id == api_key.id)
                .values(last_used_at=datetime.now(timezone.utc))
            )
            await session.commit()

            return True
    except Exception:
        logger.exception("API key validation error")
        return False


# Paths that bypass authentication
SKIP_AUTH_PATHS = {
    "/docs",
    "/openapi.json",
    "/redoc",
}

SKIP_AUTH_PREFIXES = (
    "/api/v1/health",
)


class ClerkAuthMiddleware(BaseHTTPMiddleware):
    """Middleware that verifies Clerk-issued JWTs on every request.

    Also accepts the ``X-API-Key`` header for programmatic access.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        # Skip auth for health, docs, and OpenAPI schema endpoints
        if path in SKIP_AUTH_PATHS or path.startswith(SKIP_AUTH_PREFIXES):
            return await call_next(request)

        # --- Try API-key auth first ---
        api_key_header = request.headers.get("X-API-Key")
        if api_key_header:
            if await _validate_api_key(api_key_header, request):
                return await call_next(request)
            return Response(
                content='{"detail":"Invalid or revoked API key"}',
                status_code=401,
                media_type="application/json",
            )

        # --- Fall through to JWT auth ---
        # Extract Bearer token
        auth_header = request.headers.get("Authorization")

        # Dev mode: if no token is sent, allow with a dev identity
        if settings.app_env == "development" and (not auth_header or not auth_header.startswith("Bearer ")):
            logger.debug("Dev mode: no auth token, using dev identity for %s", path)
            request.state.user_id = "dev_user"
            request.state.org_id = "dev_org"
            return await call_next(request)

        if not auth_header or not auth_header.startswith("Bearer "):
            return Response(
                content='{"detail":"Missing or invalid Authorization header"}',
                status_code=401,
                media_type="application/json",
            )

        token = auth_header.removeprefix("Bearer ").strip()

        try:
            jwks = await _get_jwks()
            public_key = _get_signing_key(jwks, token)

            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                options={"require": ["sub", "exp", "iat"]},
            )

            request.state.user_id = payload.get("sub")
            request.state.org_id = payload.get("org_id")

        except jwt.ExpiredSignatureError:
            return Response(
                content='{"detail":"Token has expired"}',
                status_code=401,
                media_type="application/json",
            )
        except jwt.InvalidTokenError as exc:
            logger.warning("JWT verification failed: %s", exc)
            return Response(
                content='{"detail":"Invalid authentication token"}',
                status_code=401,
                media_type="application/json",
            )
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch JWKS: %s", exc)
            return Response(
                content='{"detail":"Authentication service unavailable"}',
                status_code=401,
                media_type="application/json",
            )

        return await call_next(request)
