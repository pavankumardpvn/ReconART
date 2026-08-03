"""Dispute management endpoints — create, list, update, stats."""

import math
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import NotFoundError
from app.models.dispute import Dispute
from app.models.tenant import Tenant

router = APIRouter()


# ---- schemas ---------------------------------------------------------------

class DisputeCreate(BaseModel):
    exception_id: UUID | None = None
    run_id: UUID | None = None
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    priority: str = "medium"
    assigned_to: str | None = None
    due_date: str | None = None


class DisputeUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    assigned_to: str | None = None
    resolution: str | None = None
    due_date: str | None = None


class DisputeResponse(BaseModel):
    id: UUID
    exception_id: UUID | None = None
    run_id: UUID | None = None
    title: str
    description: str | None = None
    status: str
    priority: str
    assigned_to: str | None = None
    resolution: str | None = None
    resolved_at: datetime | None = None
    due_date: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---- endpoints -------------------------------------------------------------

@router.get("/")
async def list_disputes(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = None,
    assigned_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """List disputes with optional filters."""
    query = (
        select(Dispute)
        .where(Dispute.tenant_id == tenant.id)
        .order_by(Dispute.created_at.desc())
    )
    if status_filter:
        query = query.where(Dispute.status == status_filter)
    if priority:
        query = query.where(Dispute.priority == priority)
    if assigned_to:
        query = query.where(Dispute.assigned_to == assigned_to)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    result = await db.execute(
        query.offset((page - 1) * page_size).limit(page_size)
    )
    items = result.scalars().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 0,
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_dispute(
    payload: DisputeCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Create a new dispute, optionally linked to an exception."""
    from datetime import date as date_type

    dispute = Dispute(
        tenant_id=tenant.id,
        exception_id=payload.exception_id,
        run_id=payload.run_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        assigned_to=payload.assigned_to,
        due_date=date_type.fromisoformat(payload.due_date) if payload.due_date else None,
    )
    db.add(dispute)
    await db.flush()
    await db.refresh(dispute)
    return dispute


@router.get("/stats")
async def dispute_stats(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Dispute statistics: counts by status, average resolution time."""
    result = await db.execute(
        select(Dispute.status, func.count(Dispute.id).label("count"))
        .where(Dispute.tenant_id == tenant.id)
        .group_by(Dispute.status)
    )
    stats = {row.status: row.count for row in result.all()}

    # Average resolution time for resolved disputes
    avg_result = await db.execute(
        select(
            func.avg(
                func.extract("epoch", Dispute.resolved_at)
                - func.extract("epoch", Dispute.created_at)
            ).label("avg_seconds")
        ).where(
            Dispute.tenant_id == tenant.id,
            Dispute.resolved_at.isnot(None),
        )
    )
    avg_seconds = avg_result.scalar_one() or 0
    avg_hours = round(avg_seconds / 3600, 1) if avg_seconds else 0

    return {
        "open": stats.get("open", 0),
        "investigating": stats.get("investigating", 0),
        "escalated": stats.get("escalated", 0),
        "resolved": stats.get("resolved", 0),
        "closed": stats.get("closed", 0),
        "total": sum(stats.values()),
        "avg_resolution_hours": avg_hours,
    }


@router.get("/{dispute_id}")
async def get_dispute(
    dispute_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Get a single dispute by ID."""
    result = await db.execute(
        select(Dispute).where(
            Dispute.id == dispute_id,
            Dispute.tenant_id == tenant.id,
        )
    )
    dispute = result.scalar_one_or_none()
    if not dispute:
        raise NotFoundError("Dispute")
    return dispute


@router.patch("/{dispute_id}")
async def update_dispute(
    dispute_id: UUID,
    payload: DisputeUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Update a dispute (status, assignment, resolution, etc.)."""
    result = await db.execute(
        select(Dispute).where(
            Dispute.id == dispute_id,
            Dispute.tenant_id == tenant.id,
        )
    )
    dispute = result.scalar_one_or_none()
    if not dispute:
        raise NotFoundError("Dispute")

    update_data = payload.model_dump(exclude_unset=True)

    # Handle due_date string -> date conversion
    if "due_date" in update_data:
        from datetime import date as date_type
        val = update_data.pop("due_date")
        dispute.due_date = date_type.fromisoformat(val) if val else None

    for key, value in update_data.items():
        setattr(dispute, key, value)

    # Auto-set resolved_at when status changes to resolved or closed
    if payload.status in ("resolved", "closed") and not dispute.resolved_at:
        dispute.resolved_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(dispute)
    return dispute
