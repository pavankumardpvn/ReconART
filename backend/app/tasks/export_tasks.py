"""Celery tasks for generating export files."""

import asyncio
import io
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.celery_app import celery
from app.config import settings
from app.models.export import ExportJob
from app.models.matching import Exception_, MatchPair, MatchPairItem
from app.models.data_source import DataSourceRow
from app.models.tenant import Tenant
from app.storage import get_storage

logger = logging.getLogger(__name__)

_engine = create_async_engine(settings.database_url, pool_pre_ping=True)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def _generate(export_id: str) -> dict:
    async with _session_factory() as session:
        result = await session.execute(
            select(ExportJob).where(ExportJob.id == uuid.UUID(export_id))
        )
        job = result.scalar_one_or_none()
        if not job:
            return {"status": "error", "message": "Export job not found"}

        await session.execute(
            update(ExportJob).where(ExportJob.id == job.id).values(status="generating")
        )
        await session.commit()

        try:
            rows = []
            if job.export_scope in ("matched", "full"):
                pairs_result = await session.execute(
                    select(MatchPair)
                    .options(selectinload(MatchPair.items))
                    .where(MatchPair.run_id == job.run_id)
                )
                all_pairs = pairs_result.scalars().all()

                all_row_ids = set()
                for pair in all_pairs:
                    for item in pair.items:
                        all_row_ids.add(item.data_source_row_id)

                row_lookup = {}
                if all_row_ids:
                    ds_rows = await session.execute(
                        select(DataSourceRow).where(
                            DataSourceRow.id.in_(all_row_ids)
                        )
                    )
                    row_lookup = {r.id: r for r in ds_rows.scalars().all()}

                for pair in all_pairs:
                    for item in pair.items:
                        ds_row = row_lookup.get(item.data_source_row_id)
                        if ds_row:
                            rows.append({
                                "match_status": pair.match_status,
                                "side": item.side,
                                "confidence": float(pair.confidence_score) if pair.confidence_score else None,
                                "difference": float(pair.difference) if pair.difference else None,
                                **ds_row.data,
                            })

            if job.export_scope in ("unmatched", "exceptions", "full"):
                exc_result = await session.execute(
                    select(Exception_).where(Exception_.run_id == job.run_id)
                )
                all_exceptions = exc_result.scalars().all()

                exc_row_ids = {e.data_source_row_id for e in all_exceptions}
                exc_row_lookup = {}
                if exc_row_ids:
                    ds_rows = await session.execute(
                        select(DataSourceRow).where(
                            DataSourceRow.id.in_(exc_row_ids)
                        )
                    )
                    exc_row_lookup = {r.id: r for r in ds_rows.scalars().all()}

                for exc in all_exceptions:
                    ds_row = exc_row_lookup.get(exc.data_source_row_id)
                    if ds_row:
                        rows.append({
                            "match_status": "unmatched",
                            "side": exc.side,
                            "exception_type": exc.exception_type,
                            "severity": exc.severity,
                            **ds_row.data,
                        })

            import pandas as pd
            df = pd.DataFrame(rows)
            storage = get_storage()
            buf = io.BytesIO()

            if job.export_type == "csv":
                df.to_csv(buf, index=False)
                ext = "csv"
            else:
                df.to_excel(buf, index=False, engine="openpyxl")
                ext = "xlsx"

            buf.seek(0)
            content = buf.read()
            tenant_result = await session.execute(
                select(Tenant).where(Tenant.id == job.tenant_id)
            )
            tenant = tenant_result.scalar_one()
            filename = f"export_{job.id}.{ext}"
            path = await storage.save(tenant.slug, filename, content)

            await session.execute(
                update(ExportJob).where(ExportJob.id == job.id).values(
                    status="completed",
                    file_path=path,
                    file_size_bytes=len(content),
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()
            return {"status": "completed", "export_id": export_id, "path": path}

        except Exception as e:
            logger.exception("Export %s failed", export_id)
            await session.execute(
                update(ExportJob).where(ExportJob.id == job.id).values(
                    status="failed",
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()
            return {"status": "error", "message": str(e)}


@celery.task(bind=True, name="tasks.generate_export")
def generate_export(self, export_id: str) -> dict:
    logger.info("Generating export export_id=%s task_id=%s", export_id, self.request.id)
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_generate(export_id))
    finally:
        loop.close()
