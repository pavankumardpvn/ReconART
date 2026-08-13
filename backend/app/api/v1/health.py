"""Health check endpoints."""

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


@router.get("/full")
async def full_health_check(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Full health check — tests all connected services with response times."""
    results = {}

    # 1. Database
    try:
        t = time.time()
        await db.execute(text("SELECT 1"))
        results["database"] = {"status": "healthy", "time": f"{time.time()-t:.3f}s"}
    except Exception as e:
        results["database"] = {"status": "down", "error": str(e)}

    # 2. Redis
    try:
        t = time.time()
        from app.services.cache_service import _get_redis
        _get_redis().ping()
        results["redis"] = {"status": "healthy", "time": f"{time.time()-t:.3f}s"}
    except Exception as e:
        results["redis"] = {"status": "down", "error": str(e)}

    # 3. Vercel Frontend
    try:
        import httpx
        t = time.time()
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
            r = await c.get("https://recon-art.vercel.app/")
            results["frontend"] = {"status": "healthy", "http": r.status_code, "time": f"{time.time()-t:.3f}s"}
    except Exception as e:
        results["frontend"] = {"status": "down", "error": str(e)}

    # 4. Clerk Auth
    try:
        import httpx
        from app.config import settings as s
        t = time.time()
        jwks_url = s.clerk_jwks_url.replace("/.well-known/jwks.json", "") if s.clerk_jwks_url else ""
        if jwks_url:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{jwks_url}/.well-known/jwks.json")
                results["clerk"] = {"status": "healthy", "http": r.status_code, "time": f"{time.time()-t:.3f}s"}
        else:
            results["clerk"] = {"status": "unconfigured"}
    except Exception as e:
        results["clerk"] = {"status": "down", "error": str(e)}

    healthy = sum(1 for r in results.values() if r.get("status") == "healthy")
    total = len(results)
    code = 200 if healthy == total else 503

    return JSONResponse(
        content={
            "status": "healthy" if healthy == total else "degraded",
            "services": results,
            "summary": f"{healthy}/{total} healthy",
        },
        status_code=code,
    )
