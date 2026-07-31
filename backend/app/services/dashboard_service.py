"""Dashboard aggregation queries."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.matching import Exception_, ReconRun
from app.models.reconciliation import Reconciliation


async def get_summary(db: AsyncSession, tenant_id) -> dict:
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_recons = await db.execute(
        select(func.count(Reconciliation.id)).where(
            Reconciliation.tenant_id == tenant_id,
            Reconciliation.deleted_at.is_(None),
        )
    )

    total_runs = await db.execute(
        select(func.count(ReconRun.id)).where(ReconRun.tenant_id == tenant_id)
    )

    avg_match = await db.execute(
        select(func.coalesce(func.avg(ReconRun.match_rate), 0)).where(
            ReconRun.tenant_id == tenant_id,
            ReconRun.status == "completed",
        )
    )

    open_exceptions = await db.execute(
        select(func.count(Exception_.id)).where(
            Exception_.tenant_id == tenant_id,
            Exception_.status == "open",
        )
    )

    runs_this_month = await db.execute(
        select(func.count(ReconRun.id)).where(
            ReconRun.tenant_id == tenant_id,
            ReconRun.created_at >= month_start,
        )
    )

    recent_runs_result = await db.execute(
        select(ReconRun)
        .where(ReconRun.tenant_id == tenant_id)
        .order_by(ReconRun.created_at.desc())
        .limit(10)
    )
    recent_runs = recent_runs_result.scalars().all()

    return {
        "total_reconciliations": total_recons.scalar_one(),
        "total_runs": total_runs.scalar_one(),
        "average_match_rate": round(float(avg_match.scalar_one()), 2),
        "open_exceptions": open_exceptions.scalar_one(),
        "runs_this_month": runs_this_month.scalar_one(),
        "recent_runs": [
            {
                "id": str(r.id),
                "reconciliation_id": str(r.reconciliation_id),
                "status": r.status,
                "triggered_by": r.triggered_by,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "matched_count": r.matched_count,
                "unmatched_left": r.unmatched_left,
                "unmatched_right": r.unmatched_right,
                "match_rate": float(r.match_rate) if r.match_rate else 0,
                "exception_count": r.exception_count,
            }
            for r in recent_runs
        ],
    }


async def get_match_rate_trends(db: AsyncSession, tenant_id, days: int = 30) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            func.date(ReconRun.created_at).label("date"),
            func.avg(ReconRun.match_rate).label("match_rate"),
            func.count(ReconRun.id).label("run_count"),
        )
        .where(
            ReconRun.tenant_id == tenant_id,
            ReconRun.status == "completed",
            ReconRun.created_at >= cutoff,
        )
        .group_by(func.date(ReconRun.created_at))
        .order_by(func.date(ReconRun.created_at))
    )

    return [
        {
            "date": str(row.date),
            "match_rate": round(float(row.match_rate), 2),
            "run_count": row.run_count,
        }
        for row in result.all()
    ]


async def get_recent_activity(db: AsyncSession, tenant_id, limit: int = 20) -> list[dict]:
    result = await db.execute(
        select(ReconRun)
        .where(ReconRun.tenant_id == tenant_id)
        .order_by(ReconRun.created_at.desc())
        .limit(limit)
    )
    runs = result.scalars().all()

    return [
        {
            "id": str(r.id),
            "reconciliation_id": str(r.reconciliation_id),
            "status": r.status,
            "triggered_by": r.triggered_by,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "matched_count": r.matched_count,
            "match_rate": float(r.match_rate) if r.match_rate else 0,
            "created_at": r.created_at.isoformat(),
        }
        for r in runs
    ]
