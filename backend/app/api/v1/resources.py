"""Unified resources endpoint — merges sources, unions, groups, and reconciliations."""

import math
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, union_all, literal, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.models.data_source import DataSource
from app.models.reconciliation import Reconciliation
from app.models.transform import Union as UnionModel, Group
from app.models.tenant import Tenant

router = APIRouter()


@router.get("/")
async def list_resources(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    resource_type: str | None = Query(None, description="Filter: source, union, group, reconciliation"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    queries = []

    if not resource_type or resource_type == "source":
        source_q = (
            select(
                cast(DataSource.id, String).label("id"),
                DataSource.name.label("name"),
                literal("source").label("resource_type"),
                DataSource.status.label("status"),
                DataSource.row_count.label("row_count"),
                DataSource.created_at.label("created_at"),
                DataSource.source_type.label("sub_type"),
            )
            .where(DataSource.tenant_id == tenant.id, DataSource.deleted_at.is_(None))
        )
        queries.append(source_q)

    if not resource_type or resource_type == "union":
        union_q = (
            select(
                cast(UnionModel.id, String).label("id"),
                UnionModel.name.label("name"),
                literal("union").label("resource_type"),
                literal("active").label("status"),
                literal(0).label("row_count"),
                UnionModel.created_at.label("created_at"),
                literal("union").label("sub_type"),
            )
            .where(UnionModel.tenant_id == tenant.id)
        )
        queries.append(union_q)

    if not resource_type or resource_type == "group":
        group_q = (
            select(
                cast(Group.id, String).label("id"),
                Group.name.label("name"),
                literal("group").label("resource_type"),
                literal("active").label("status"),
                literal(0).label("row_count"),
                Group.created_at.label("created_at"),
                literal("group").label("sub_type"),
            )
            .where(Group.tenant_id == tenant.id)
        )
        queries.append(group_q)

    if not resource_type or resource_type == "reconciliation":
        recon_q = (
            select(
                cast(Reconciliation.id, String).label("id"),
                Reconciliation.name.label("name"),
                literal("reconciliation").label("resource_type"),
                Reconciliation.status.label("status"),
                literal(0).label("row_count"),
                Reconciliation.created_at.label("created_at"),
                Reconciliation.recon_type.label("sub_type"),
            )
            .where(
                Reconciliation.tenant_id == tenant.id,
                Reconciliation.deleted_at.is_(None),
                Reconciliation.status != "template",
            )
        )
        queries.append(recon_q)

    if not queries:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 0}

    combined = union_all(*queries).subquery()

    total_result = await db.execute(select(func.count()).select_from(combined))
    total = total_result.scalar_one()
    total_pages = math.ceil(total / page_size) if total > 0 else 0

    offset = (page - 1) * page_size
    rows = await db.execute(
        select(combined).order_by(combined.c.created_at.desc()).offset(offset).limit(page_size)
    )

    items = []
    for idx, row in enumerate(rows.all()):
        items.append({
            "id": row.id,
            "numeric_id": total - offset - idx,
            "name": row.name,
            "resource_type": row.resource_type,
            "status": row.status,
            "row_count": row.row_count,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "sub_type": row.sub_type,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }
