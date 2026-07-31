"""Anomaly detection endpoints for data source rows."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import NotFoundError
from app.models.data_source import DataSource
from app.models.tenant import Tenant
from app.services.anomaly_detection import detect_anomalies

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{data_source_id}")
async def get_anomalies(
    data_source_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Detect anomalies in a data source's rows.

    Analyzes all rows in the specified data source for:
    - Statistical outliers (numeric values > 3 std devs from mean)
    - Date gaps (> 2x the median gap)
    - Duplicate rows (identical across all columns)
    """
    # Verify the data source exists and belongs to the tenant
    result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    anomalies = await detect_anomalies(db, data_source_id, tenant.id)

    # Build summary counts
    summary: dict[str, int] = {}
    for a in anomalies:
        t = a["anomaly_type"]
        summary[t] = summary.get(t, 0) + 1

    return {
        "data_source_id": str(data_source_id),
        "data_source_name": ds.name,
        "total_anomalies": len(anomalies),
        "summary": summary,
        "items": anomalies,
    }
