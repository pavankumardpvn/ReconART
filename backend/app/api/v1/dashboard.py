"""Dashboard endpoints — aggregated stats, match-rate trends, recent activity."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, cast, func, select, Float
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.models.matching import Exception_, ReconRun
from app.models.reconciliation import Reconciliation
from app.models.tenant import Tenant
from app.schemas.dashboard import DashboardSummary, MatchRateTrend
from app.schemas.reconciliation import ReconRunResponse

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /summary — aggregated dashboard stats
# ---------------------------------------------------------------------------
@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Total active reconciliations
    recon_count_result = await db.execute(
        select(func.count(Reconciliation.id)).where(
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.deleted_at.is_(None),
        )
    )
    total_reconciliations = recon_count_result.scalar_one()

    # Total runs
    run_count_result = await db.execute(
        select(func.count(ReconRun.id)).where(ReconRun.tenant_id == tenant.id)
    )
    total_runs = run_count_result.scalar_one()

    # Average match rate (across completed runs)
    avg_result = await db.execute(
        select(func.avg(ReconRun.match_rate)).where(
            ReconRun.tenant_id == tenant.id,
            ReconRun.status == "completed",
            ReconRun.match_rate.isnot(None),
        )
    )
    avg_match_rate = avg_result.scalar_one()
    average_match_rate = float(avg_match_rate) if avg_match_rate is not None else 0.0

    # Open exceptions
    open_exc_result = await db.execute(
        select(func.count(Exception_.id)).where(
            Exception_.tenant_id == tenant.id,
            Exception_.status == "open",
        )
    )
    open_exceptions = open_exc_result.scalar_one()

    # Runs this month
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_result = await db.execute(
        select(func.count(ReconRun.id)).where(
            ReconRun.tenant_id == tenant.id,
            ReconRun.created_at >= month_start,
        )
    )
    runs_this_month = month_result.scalar_one()

    # Recent runs (last 10)
    recent_result = await db.execute(
        select(ReconRun)
        .where(ReconRun.tenant_id == tenant.id)
        .order_by(ReconRun.created_at.desc())
        .limit(10)
    )
    recent_runs_models = list(recent_result.scalars().all())
    recent_runs = [
        ReconRunResponse.model_validate(r) for r in recent_runs_models
    ]

    return DashboardSummary(
        total_reconciliations=total_reconciliations,
        total_runs=total_runs,
        average_match_rate=average_match_rate,
        open_exceptions=open_exceptions,
        runs_this_month=runs_this_month,
        recent_runs=recent_runs,
    )


# ---------------------------------------------------------------------------
# GET /match-rates — match rate trend (last N days)
# ---------------------------------------------------------------------------
@router.get("/match-rates", response_model=list[MatchRateTrend])
async def match_rate_trends(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            func.date(ReconRun.created_at).label("date"),
            func.avg(ReconRun.match_rate).label("match_rate"),
            func.count(ReconRun.id).label("run_count"),
        )
        .where(
            ReconRun.tenant_id == tenant.id,
            ReconRun.status == "completed",
            ReconRun.match_rate.isnot(None),
            ReconRun.created_at >= since,
        )
        .group_by(func.date(ReconRun.created_at))
        .order_by(func.date(ReconRun.created_at))
    )

    trends: list[MatchRateTrend] = []
    for row in result.all():
        trends.append(
            MatchRateTrend(
                date=str(row.date),
                match_rate=float(row.match_rate) if row.match_rate is not None else 0.0,
                run_count=row.run_count,
            )
        )
    return trends


# ---------------------------------------------------------------------------
# GET /recent-activity — last 20 recon runs
# ---------------------------------------------------------------------------
@router.get("/recent-activity", response_model=list[ReconRunResponse])
async def recent_activity(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ReconRun)
        .where(ReconRun.tenant_id == tenant.id)
        .order_by(ReconRun.created_at.desc())
        .limit(20)
    )
    return list(result.scalars().all())
