"""Clerk JWT verification middleware for FastAPI.

Also supports API-key authentication via the ``X-API-Key`` header as an
alternative to JWT Bearer tokens.  When an API key is presented the
middleware validates it against the ``api_keys`` table and sets
``request.state.user_id`` / ``request.state.org_id`` accordingly.
"""

import asyncio
import hashlib
import logging
import time
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

# Cache parsed RSA keys by kid to avoid repeated from_jwk() calls
_rsa_key_cache: dict[str, Any] = {}

# Cache decoded JWT payloads briefly (token_hash -> (payload, expiry))
_jwt_cache: dict[str, tuple[dict, float]] = {}
_JWT_CACHE_TTL = 30  # seconds


def _get_lock() -> asyncio.Lock:
    global _jwks_lock
    if _jwks_lock is None:
        _jwks_lock = asyncio.Lock()
    return _jwks_lock


async def _get_jwks() -> dict[str, Any]:
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
    try:
        jwks = await _get_jwks()
        for key_data in jwks.get("keys", []):
            kid = key_data.get("kid")
            if kid:
                _rsa_key_cache[kid] = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
        logger.info("JWKS cache warmed — %d keys parsed", len(_rsa_key_cache))
    except Exception as e:
        logger.warning("Failed to pre-warm JWKS cache: %s", e)


def _get_signing_key(jwks: dict[str, Any], token: str) -> Any:
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")

    if kid in _rsa_key_cache:
        return _rsa_key_cache[kid]

    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            key = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
            _rsa_key_cache[kid] = key
            return key

    raise jwt.InvalidTokenError(f"No matching key found for kid: {kid}")


def _check_jwt_cache(token: str) -> dict | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
    cached = _jwt_cache.get(token_hash)
    if cached and cached[1] > time.time():
        return cached[0]
    return None


def _set_jwt_cache(token: str, payload: dict) -> None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
    _jwt_cache[token_hash] = (payload, time.time() + _JWT_CACHE_TTL)
    if len(_jwt_cache) > 500:
        now = time.time()
        expired = [k for k, v in _jwt_cache.items() if v[1] <= now]
        for k in expired:
            _jwt_cache.pop(k, None)


async def _validate_api_key(raw_key: str, request: Request) -> bool:
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    try:
        from sqlalchemy import select, update
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

            request.state.user_id = f"api_key_{api_key.id}"
            request.state.org_id = None
            request.state.api_key_tenant_id = api_key.tenant_id

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


SKIP_AUTH_PATHS = {
    "/docs",
    "/openapi.json",
    "/redoc",
}

SKIP_AUTH_PREFIXES = (
    "/api/v1/health",
)


class ClerkAuthMiddleware(BaseHTTPMiddleware):

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path

        if path in SKIP_AUTH_PATHS or path.startswith(SKIP_AUTH_PREFIXES):
            return await call_next(request)

        # --- API-key auth ---
        api_key_header = request.headers.get("X-API-Key")
        if api_key_header:
            if await _validate_api_key(api_key_header, request):
                return await call_next(request)
            return Response(
                content='{"detail":"Invalid or revoked API key"}',
                status_code=401,
                media_type="application/json",
            )

        # --- JWT auth ---
        auth_header = request.headers.get("Authorization")

        if settings.app_env == "development" and (not auth_header or not auth_header.startswith("Bearer ")):
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

        # Check JWT cache first
        cached_payload = _check_jwt_cache(token)
        if cached_payload:
            request.state.user_id = cached_payload.get("sub")
            request.state.org_id = cached_payload.get("org_id")
            return await call_next(request)

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
            _set_jwt_cache(token, payload)

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
