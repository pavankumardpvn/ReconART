"""Health check endpoints."""

import logging

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
