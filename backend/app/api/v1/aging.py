"""Aging analysis endpoints for open reconciliation exceptions."""

import logging
import math
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.models.data_source import DataSourceRow
from app.models.matching import Exception_
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter()


def _bucket_label(days: int) -> str:
    if days <= 7:
        return "0-7 days"
    elif days <= 14:
        return "8-14 days"
    elif days <= 30:
        return "15-30 days"
    elif days <= 60:
        return "31-60 days"
    else:
        return "60+ days"


BUCKET_ORDER = ["0-7 days", "8-14 days", "15-30 days", "31-60 days", "60+ days"]


@router.get("/")
async def aging_analysis(
    reconciliation_id: UUID | None = Query(None, description="Filter by reconciliation"),
    run_id: UUID | None = Query(None, description="Filter by run"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Aging analysis for all open exceptions.

    Groups open exceptions into time-based buckets and returns counts plus
    total amounts per bucket.
    """
    query = select(Exception_).where(
        Exception_.tenant_id == tenant.id,
        Exception_.status == "open",
    )
    if reconciliation_id:
        from app.models.matching import ReconRun
        run_ids_q = select(ReconRun.id).where(
            ReconRun.reconciliation_id == reconciliation_id,
            ReconRun.tenant_id == tenant.id,
        )
        query = query.where(Exception_.run_id.in_(run_ids_q))
    if run_id:
        query = query.where(Exception_.run_id == run_id)

    result = await db.execute(query)
    exceptions = result.scalars().all()

    now = datetime.now(timezone.utc)

    # Initialize buckets
    buckets: dict[str, dict] = {}
    for label in BUCKET_ORDER:
        buckets[label] = {"range": label, "count": 0, "total_amount": 0.0}

    items = []
    for exc in exceptions:
        days_old = (now - exc.created_at).days if exc.created_at else 0
        label = _bucket_label(days_old)
        buckets[label]["count"] += 1

        # Try to get amount from the row data
        amount = 0.0
        row_data: dict = {}
        if exc.data_source_row_id:
            row_result = await db.execute(
                select(DataSourceRow).where(DataSourceRow.id == exc.data_source_row_id)
            )
            row = row_result.scalar_one_or_none()
            if row and row.data:
                row_data = row.data
                # Look for amount-like columns
                for col_name, val in row.data.items():
                    if any(kw in col_name.lower() for kw in ("amount", "total", "value", "balance", "sum")):
                        try:
                            amount = float(val)
                            break
                        except (TypeError, ValueError):
                            continue

        buckets[label]["total_amount"] += amount

        items.append({
            "id": str(exc.id),
            "run_id": str(exc.run_id),
            "side": exc.side,
            "exception_type": exc.exception_type,
            "severity": exc.severity,
            "days_old": days_old,
            "bucket": label,
            "amount": amount,
            "row_data": row_data,
            "created_at": exc.created_at.isoformat() if exc.created_at else None,
        })

    # Round totals
    for b in buckets.values():
        b["total_amount"] = round(b["total_amount"], 2)

    return {
        "buckets": [buckets[label] for label in BUCKET_ORDER],
        "items": items,
    }


@router.get("/escalations")
async def aging_escalations(
    days_threshold: int = Query(30, ge=1, description="Age threshold in days"),
    reconciliation_id: UUID | None = Query(None, description="Filter by reconciliation"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Return open exceptions older than the given threshold, ordered by age descending."""
    query = select(Exception_).where(
        Exception_.tenant_id == tenant.id,
        Exception_.status == "open",
    )
    if reconciliation_id:
        from app.models.matching import ReconRun
        run_ids_q = select(ReconRun.id).where(
            ReconRun.reconciliation_id == reconciliation_id,
            ReconRun.tenant_id == tenant.id,
        )
        query = query.where(Exception_.run_id.in_(run_ids_q))

    result = await db.execute(query)
    exceptions = result.scalars().all()

    now = datetime.now(timezone.utc)
    escalated = []

    for exc in exceptions:
        days_old = (now - exc.created_at).days if exc.created_at else 0
        if days_old < days_threshold:
            continue

        row_data: dict = {}
        if exc.data_source_row_id:
            row_result = await db.execute(
                select(DataSourceRow).where(DataSourceRow.id == exc.data_source_row_id)
            )
            row = row_result.scalar_one_or_none()
            if row and row.data:
                row_data = row.data

        escalated.append({
            "id": str(exc.id),
            "run_id": str(exc.run_id),
            "side": exc.side,
            "exception_type": exc.exception_type,
            "severity": exc.severity,
            "status": exc.status,
            "days_old": days_old,
            "row_data": row_data,
            "created_at": exc.created_at.isoformat() if exc.created_at else None,
        })

    # Sort by age descending
    escalated.sort(key=lambda x: x["days_old"], reverse=True)

    return {
        "threshold_days": days_threshold,
        "total_escalated": len(escalated),
        "items": escalated,
    }
