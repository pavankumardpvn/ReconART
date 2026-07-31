"""Reconciliation analytics endpoints — trends, productivity, exceptions, variance, summary."""

import math
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.models.matching import Exception_, MatchPair, ReconRun
from app.models.reconciliation import Reconciliation
from app.models.tenant import Tenant

router = APIRouter()


@router.get("/trends")
async def match_rate_trends(
    days: int = Query(30, ge=7, le=365),
    reconciliation_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Match rate trends over the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        select(
            func.date(ReconRun.completed_at).label("date"),
            func.avg(ReconRun.match_rate).label("avg_match_rate"),
            func.count(ReconRun.id).label("run_count"),
            func.sum(ReconRun.matched_count).label("total_matched"),
            func.sum(ReconRun.exception_count).label("total_exceptions"),
        )
        .where(
            ReconRun.tenant_id == tenant.id,
            ReconRun.status == "completed",
            ReconRun.completed_at >= since,
        )
        .group_by(func.date(ReconRun.completed_at))
        .order_by(func.date(ReconRun.completed_at))
    )
    if reconciliation_id:
        query = query.where(ReconRun.reconciliation_id == reconciliation_id)

    result = await db.execute(query)
    rows = result.all()

    return {
        "period_days": days,
        "data_points": [
            {
                "date": str(r.date),
                "avg_match_rate": round(float(r.avg_match_rate or 0), 2),
                "run_count": r.run_count,
                "total_matched": r.total_matched or 0,
                "total_exceptions": r.total_exceptions or 0,
            }
            for r in rows
        ],
    }


@router.get("/productivity")
async def productivity_metrics(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Reconciliations completed per user and average completion time."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Runs per user
    per_user = await db.execute(
        select(
            ReconRun.triggered_by.label("user_id"),
            func.count(ReconRun.id).label("completed_runs"),
            func.avg(
                func.extract("epoch", ReconRun.completed_at)
                - func.extract("epoch", ReconRun.started_at)
            ).label("avg_duration_seconds"),
        )
        .where(
            ReconRun.tenant_id == tenant.id,
            ReconRun.status == "completed",
            ReconRun.completed_at >= since,
        )
        .group_by(ReconRun.triggered_by)
    )
    user_rows = per_user.all()

    # Overall stats
    overall = await db.execute(
        select(
            func.count(ReconRun.id).label("total_runs"),
            func.avg(
                func.extract("epoch", ReconRun.completed_at)
                - func.extract("epoch", ReconRun.started_at)
            ).label("avg_duration_seconds"),
        ).where(
            ReconRun.tenant_id == tenant.id,
            ReconRun.status == "completed",
            ReconRun.completed_at >= since,
        )
    )
    overall_row = overall.one()

    return {
        "period_days": days,
        "total_completed_runs": overall_row.total_runs or 0,
        "avg_completion_seconds": round(float(overall_row.avg_duration_seconds or 0), 1),
        "per_user": [
            {
                "user_id": r.user_id,
                "completed_runs": r.completed_runs,
                "avg_duration_seconds": round(float(r.avg_duration_seconds or 0), 1),
            }
            for r in user_rows
        ],
    }


@router.get("/exceptions")
async def exception_analytics(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Exception trends by type and resolution metrics."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Exceptions by type
    by_type = await db.execute(
        select(
            Exception_.exception_type,
            Exception_.status,
            func.count(Exception_.id).label("count"),
        )
        .where(
            Exception_.tenant_id == tenant.id,
            Exception_.created_at >= since,
        )
        .group_by(Exception_.exception_type, Exception_.status)
    )
    type_rows = by_type.all()

    # Build a breakdown dict
    breakdown: dict = {}
    for r in type_rows:
        if r.exception_type not in breakdown:
            breakdown[r.exception_type] = {}
        breakdown[r.exception_type][r.status] = r.count

    # Average resolution time
    avg_res = await db.execute(
        select(
            func.avg(
                func.extract("epoch", Exception_.resolved_at)
                - func.extract("epoch", Exception_.created_at)
            ).label("avg_seconds")
        ).where(
            Exception_.tenant_id == tenant.id,
            Exception_.resolved_at.isnot(None),
            Exception_.created_at >= since,
        )
    )
    avg_seconds = avg_res.scalar_one() or 0

    # Daily exception count trend
    daily = await db.execute(
        select(
            func.date(Exception_.created_at).label("date"),
            func.count(Exception_.id).label("count"),
        )
        .where(
            Exception_.tenant_id == tenant.id,
            Exception_.created_at >= since,
        )
        .group_by(func.date(Exception_.created_at))
        .order_by(func.date(Exception_.created_at))
    )
    daily_rows = daily.all()

    return {
        "period_days": days,
        "by_type_and_status": breakdown,
        "avg_resolution_seconds": round(float(avg_seconds), 1),
        "avg_resolution_hours": round(float(avg_seconds) / 3600, 1) if avg_seconds else 0,
        "daily_trend": [
            {"date": str(r.date), "count": r.count}
            for r in daily_rows
        ],
    }


@router.get("/variance")
async def variance_analysis(
    reconciliation_id: UUID,
    last_n_runs: int = Query(5, ge=2, le=50),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Compare the last N runs for a reconciliation to track variance over time."""
    result = await db.execute(
        select(ReconRun)
        .where(
            ReconRun.reconciliation_id == reconciliation_id,
            ReconRun.tenant_id == tenant.id,
            ReconRun.status == "completed",
        )
        .order_by(ReconRun.completed_at.desc())
        .limit(last_n_runs)
    )
    runs = list(result.scalars().all())
    runs.reverse()  # oldest first

    if len(runs) < 2:
        return {
            "reconciliation_id": str(reconciliation_id),
            "message": "Need at least 2 completed runs for variance analysis",
            "runs_analyzed": len(runs),
            "comparisons": [],
        }

    comparisons = []
    for i in range(1, len(runs)):
        prev = runs[i - 1]
        curr = runs[i]

        prev_rate = float(prev.match_rate) if prev.match_rate else 0
        curr_rate = float(curr.match_rate) if curr.match_rate else 0

        comparisons.append({
            "run_id": str(curr.id),
            "completed_at": curr.completed_at.isoformat() if curr.completed_at else None,
            "match_rate": curr_rate,
            "match_rate_change": round(curr_rate - prev_rate, 4),
            "matched_count": curr.matched_count,
            "matched_change": (curr.matched_count or 0) - (prev.matched_count or 0),
            "exception_count": curr.exception_count,
            "exception_change": (curr.exception_count or 0) - (prev.exception_count or 0),
            "left_row_count": curr.left_row_count,
            "right_row_count": curr.right_row_count,
        })

    return {
        "reconciliation_id": str(reconciliation_id),
        "runs_analyzed": len(runs),
        "comparisons": comparisons,
    }


@router.get("/summary")
async def analytics_summary(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Overall health summary combining all analytics metrics."""
    now = datetime.now(timezone.utc)
    last_30_days = now - timedelta(days=30)

    # Total recons
    recon_count = (await db.execute(
        select(func.count(Reconciliation.id)).where(
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.deleted_at.is_(None),
        )
    )).scalar_one()

    # Completed runs in last 30 days
    runs_30d = (await db.execute(
        select(func.count(ReconRun.id)).where(
            ReconRun.tenant_id == tenant.id,
            ReconRun.status == "completed",
            ReconRun.completed_at >= last_30_days,
        )
    )).scalar_one()

    # Average match rate in last 30 days
    avg_match = (await db.execute(
        select(func.avg(ReconRun.match_rate)).where(
            ReconRun.tenant_id == tenant.id,
            ReconRun.status == "completed",
            ReconRun.completed_at >= last_30_days,
        )
    )).scalar_one()

    # Open exceptions
    open_exceptions = (await db.execute(
        select(func.count(Exception_.id)).where(
            Exception_.tenant_id == tenant.id,
            Exception_.status == "open",
        )
    )).scalar_one()

    # Failed runs in last 30 days
    failed_runs = (await db.execute(
        select(func.count(ReconRun.id)).where(
            ReconRun.tenant_id == tenant.id,
            ReconRun.status == "failed",
            ReconRun.completed_at >= last_30_days,
        )
    )).scalar_one()

    # Compute health score (0-100)
    avg_rate = float(avg_match) if avg_match else 0
    fail_penalty = min(failed_runs * 5, 30)  # up to 30 pts penalty
    exception_penalty = min(open_exceptions * 0.5, 20)  # up to 20 pts penalty
    health_score = max(0, min(100, avg_rate - fail_penalty - exception_penalty))

    return {
        "health_score": round(health_score, 1),
        "total_reconciliations": recon_count,
        "runs_last_30_days": runs_30d,
        "avg_match_rate_30d": round(avg_rate, 2),
        "open_exceptions": open_exceptions,
        "failed_runs_30d": failed_runs,
    }
