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
    docs_url="/docs" if settings.app_env == "development" else None,
    redoc_url="/redoc" if settings.app_env == "development" else None,
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

    logger.info("Recon ART API started — DB pool warmed, JWKS cached")
