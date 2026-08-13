"""Dashboard endpoints — aggregated stats, match-rate trends, recent activity."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.services.cache_service import cache_get, cache_set
from app.models.matching import Exception_, ReconRun
from app.models.reconciliation import Reconciliation
from app.models.tenant import Tenant
from app.schemas.dashboard import DashboardSummary, MatchRateTrend
from app.schemas.reconciliation import ReconRunResponse

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /summary — aggregated dashboard stats (parallel queries + cached)
# ---------------------------------------------------------------------------
@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    cache_key = f"dashboard:summary:{tenant.id}"
    cached = await cache_get(cache_key)
    if cached:
        return DashboardSummary(**cached)

    month_start = datetime.now(timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )

    # Run all 6 queries in parallel instead of sequentially
    recon_q, run_q, avg_q, exc_q, month_q, recent_q = await asyncio.gather(
        db.execute(
            select(func.count(Reconciliation.id)).where(
                Reconciliation.tenant_id == tenant.id,
                Reconciliation.deleted_at.is_(None),
            )
        ),
        db.execute(
            select(func.count(ReconRun.id)).where(
                ReconRun.tenant_id == tenant.id
            )
        ),
        db.execute(
            select(func.avg(ReconRun.match_rate)).where(
                ReconRun.tenant_id == tenant.id,
                ReconRun.status == "completed",
                ReconRun.match_rate.isnot(None),
            )
        ),
        db.execute(
            select(func.count(Exception_.id)).where(
                Exception_.tenant_id == tenant.id,
                Exception_.status == "open",
            )
        ),
        db.execute(
            select(func.count(ReconRun.id)).where(
                ReconRun.tenant_id == tenant.id,
                ReconRun.created_at >= month_start,
            )
        ),
        db.execute(
            select(ReconRun)
            .where(ReconRun.tenant_id == tenant.id)
            .order_by(ReconRun.created_at.desc())
            .limit(10)
        ),
    )

    avg_match_rate = avg_q.scalar_one()
    recent_runs = [
        ReconRunResponse.model_validate(r) for r in recent_q.scalars().all()
    ]

    summary = DashboardSummary(
        total_reconciliations=recon_q.scalar_one(),
        total_runs=run_q.scalar_one(),
        average_match_rate=float(avg_match_rate) if avg_match_rate is not None else 0.0,
        open_exceptions=exc_q.scalar_one(),
        runs_this_month=month_q.scalar_one(),
        recent_runs=recent_runs,
    )
    await cache_set(cache_key, summary.model_dump(), ttl=30)
    return summary


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
    cache_key = f"dashboard:match-rates:{tenant.id}:{days}"
    cached = await cache_get(cache_key)
    if cached:
        return [MatchRateTrend(**t) for t in cached]

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
    await cache_set(cache_key, [t.model_dump() for t in trends], ttl=60)
    return trends


# ---------------------------------------------------------------------------
# GET /recent-activity — last 20 recon runs (cached)
# ---------------------------------------------------------------------------
@router.get("/recent-activity", response_model=list[ReconRunResponse])
async def recent_activity(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    cache_key = f"dashboard:recent:{tenant.id}"
    cached = await cache_get(cache_key)
    if cached:
        return [ReconRunResponse(**r) for r in cached]

    result = await db.execute(
        select(ReconRun)
        .where(ReconRun.tenant_id == tenant.id)
        .order_by(ReconRun.created_at.desc())
        .limit(20)
    )
    runs = list(result.scalars().all())
    response = [ReconRunResponse.model_validate(r) for r in runs]
    await cache_set(cache_key, [r.model_dump() for r in response], ttl=15)
    return response
