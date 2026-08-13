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
    from app.services.event_service import publish_event
    from app.services.cache_service import cache_delete
    from sqlalchemy import select
    from app.models.reconciliation import Reconciliation

    async with _get_async_session() as session:
        recon_result = await session.execute(
            select(Reconciliation).where(Reconciliation.id == uuid.UUID(recon_id))
        )
        recon = recon_result.scalar_one_or_none()
        tenant_id = str(recon.tenant_id) if recon else ""
        recon_name = recon.name if recon else "Unknown"

        publish_event(tenant_id, "recon.started", {
            "recon_id": recon_id, "run_id": run_id, "name": recon_name,
        })

        try:
            engine = MatchingEngine(session)
            stats = await engine.run(
                reconciliation_id=uuid.UUID(recon_id),
                run_id=uuid.UUID(run_id),
            )
            result = {
                "status": "completed",
                "recon_id": recon_id,
                "run_id": run_id,
                "name": recon_name,
                "matched": stats.matched,
                "unmatched_left": stats.unmatched_left,
                "unmatched_right": stats.unmatched_right,
                "match_rate": stats.match_rate,
            }
            publish_event(tenant_id, "recon.completed", result)
            await cache_delete(f"dashboard:*:{tenant_id}")
            return result

        except Exception as e:
            publish_event(tenant_id, "recon.failed", {
                "recon_id": recon_id, "run_id": run_id, "name": recon_name,
                "error": str(e),
            })
            raise


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
