"""Health check endpoints."""

import asyncio
import logging
import time

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
async def health_check() -> dict:
    """Basic liveness check."""
    return {"status": "healthy", "service": "recon-art"}


@router.get("/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Readiness check that verifies database connectivity."""
    try:
        await db.execute(text("SELECT 1"))
        return JSONResponse(content={"status": "ready"}, status_code=200)
    except Exception as exc:
        logger.error("Readiness check failed: %s", exc)
        return JSONResponse(
            content={"status": "not ready", "detail": str(exc)},
            status_code=503,
        )


async def _check_db(db: AsyncSession) -> dict:
    try:
        t = time.time()
        await db.execute(text("SELECT 1"))
        return {"status": "healthy", "time": f"{time.time()-t:.3f}s"}
    except Exception as e:
        return {"status": "down", "error": str(e)}


async def _check_redis() -> dict:
    try:
        t = time.time()
        from app.services.cache_service import _get_redis
        _get_redis().ping()
        return {"status": "healthy", "time": f"{time.time()-t:.3f}s"}
    except Exception as e:
        return {"status": "down", "error": str(e)}


async def _check_url(name: str, url: str) -> dict:
    try:
        import httpx
        t = time.time()
        async with httpx.AsyncClient(timeout=5, follow_redirects=True) as c:
            r = await c.get(url)
            return {"status": "healthy", "http": r.status_code, "time": f"{time.time()-t:.3f}s"}
    except Exception as e:
        return {"status": "down", "error": str(e)}


@router.get("/full")
async def full_health_check(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Full health check — tests all services in parallel."""
    from app.config import settings as s

    jwks_url = s.clerk_jwks_url.replace("/.well-known/jwks.json", "") if s.clerk_jwks_url else ""
    clerk_url = f"{jwks_url}/.well-known/jwks.json" if jwks_url else ""

    # Run all checks in parallel
    db_result, redis_result, frontend_result, clerk_result = await asyncio.gather(
        _check_db(db),
        _check_redis(),
        _check_url("frontend", "https://recon-art.vercel.app/"),
        _check_url("clerk", clerk_url) if clerk_url else asyncio.coroutine(lambda: {"status": "unconfigured"})(),
    )

    results = {
        "database": db_result,
        "redis": redis_result,
        "frontend": frontend_result,
        "clerk": clerk_result,
    }

    healthy = sum(1 for r in results.values() if r.get("status") == "healthy")
    total = len(results)

    return JSONResponse(
        content={
            "status": "healthy" if healthy == total else "degraded",
            "services": results,
            "summary": f"{healthy}/{total} healthy",
        },
        status_code=200 if healthy == total else 503,
    )
