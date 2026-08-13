"""Recon ART FastAPI application entry point."""

import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from app.api.router import api_router
from app.auth.middleware import ClerkAuthMiddleware
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Recon ART API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# -- Clerk JWT auth (applied first — innermost middleware, runs first) --
app.add_middleware(ClerkAuthMiddleware)

# -- GZip compression for responses >= 500 bytes --
app.add_middleware(GZipMiddleware, minimum_size=500)

# -- CORS (applied last — outermost middleware) --
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- API routes --
app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
async def on_startup() -> None:
    from app.database import engine
    async with engine.connect() as conn:
        from sqlalchemy import text
        await conn.execute(text("SELECT 1"))

    from app.auth.middleware import warm_jwks_cache
    await warm_jwks_cache()

    # Start background keepalive to prevent Neon DB from sleeping
    import asyncio
    asyncio.create_task(_db_keepalive())

    logger.info("Recon ART API started — DB pool warmed, JWKS cached, keepalive started")


async def _db_keepalive() -> None:
    """Ping DB + Redis + refresh JWKS every 2 minutes to keep everything warm."""
    import asyncio
    from sqlalchemy import text
    from app.database import engine

    while True:
        await asyncio.sleep(120)
        # DB ping
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception:
            logger.warning("DB keepalive ping failed", exc_info=True)
        # Redis ping
        try:
            from app.services.cache_service import _get_redis
            _get_redis().ping()
        except Exception:
            pass
        # Refresh JWKS cache
        try:
            from app.auth.middleware import _get_jwks
            await _get_jwks()
        except Exception:
            pass
