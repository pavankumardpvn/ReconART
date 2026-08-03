"""Celery tasks for running reconciliations."""

import asyncio
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.celery_app import celery
from app.config import settings
from app.services.matching_engine import MatchingEngine

logger = logging.getLogger(__name__)


_engine = create_async_engine(settings.database_url, pool_pre_ping=True)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)


def _get_async_session() -> AsyncSession:
    return _session_factory()


async def _run_recon(recon_id: str, run_id: str) -> dict:
    async with _get_async_session() as session:
        engine = MatchingEngine(session)
        stats = await engine.run(
            reconciliation_id=uuid.UUID(recon_id),
            run_id=uuid.UUID(run_id),
        )
        return {
            "status": "completed",
            "recon_id": recon_id,
            "run_id": run_id,
            "matched": stats.matched,
            "unmatched_left": stats.unmatched_left,
            "unmatched_right": stats.unmatched_right,
            "match_rate": stats.match_rate,
        }


@celery.task(bind=True, name="tasks.run_reconciliation")
def run_reconciliation(self, recon_id: str, run_id: str) -> dict:
    logger.info(
        "Running reconciliation recon_id=%s run_id=%s task_id=%s",
        recon_id, run_id, self.request.id,
    )
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_run_recon(recon_id, run_id))
    finally:
        loop.close()
