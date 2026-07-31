"""Schedule endpoints — create, list, update, delete recurring reconciliation schedules."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import NotFoundError
from app.models.reconciliation import Reconciliation
from app.models.schedule import Schedule
from app.models.tenant import Tenant
from app.schemas.common import PaginatedResponse
from app.schemas.schedule import ScheduleCreate, ScheduleResponse, ScheduleUpdate
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)

router = APIRouter()


# ---- internal helper --------------------------------------------------------

async def _get_schedule_or_404(
    schedule_id: UUID,
    tenant: Tenant,
    db: AsyncSession,
) -> Schedule:
    result = await db.execute(
        select(Schedule).where(
            Schedule.id == schedule_id,
            Schedule.tenant_id == tenant.id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise NotFoundError("Schedule")
    return schedule


# ---------------------------------------------------------------------------
# GET / — list schedules
# ---------------------------------------------------------------------------
@router.get("/", response_model=PaginatedResponse[ScheduleResponse])
async def list_schedules(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    reconciliation_id: UUID | None = Query(None, description="Filter by reconciliation"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(Schedule)
        .where(Schedule.tenant_id == tenant.id)
        .order_by(Schedule.created_at.desc())
    )
    if reconciliation_id:
        query = query.where(Schedule.reconciliation_id == reconciliation_id)
    return await paginate(db, query, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# POST / — create schedule
# ---------------------------------------------------------------------------
@router.post("/", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    payload: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Verify reconciliation exists and belongs to tenant
    recon_result = await db.execute(
        select(Reconciliation).where(
            Reconciliation.id == payload.reconciliation_id,
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.deleted_at.is_(None),
        )
    )
    if not recon_result.scalar_one_or_none():
        raise NotFoundError("Reconciliation")

    schedule = Schedule(
        tenant_id=tenant.id,
        reconciliation_id=payload.reconciliation_id,
        name=payload.name or f"Schedule for {payload.reconciliation_id}",
        cron_expression=payload.cron_expression,
        timezone=payload.timezone,
        is_active=True,
    )
    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)
    return schedule


# ---------------------------------------------------------------------------
# GET /{id} — get schedule detail
# ---------------------------------------------------------------------------
@router.get("/{schedule_id}", response_model=ScheduleResponse)
async def get_schedule(
    schedule_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    return await _get_schedule_or_404(schedule_id, tenant, db)


# ---------------------------------------------------------------------------
# PATCH /{id} — update schedule (cron, active toggle, etc.)
# ---------------------------------------------------------------------------
@router.patch("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: UUID,
    payload: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    schedule = await _get_schedule_or_404(schedule_id, tenant, db)

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(schedule, key, value)

    await db.flush()
    await db.refresh(schedule)
    return schedule


# ---------------------------------------------------------------------------
# DELETE /{id} — delete schedule
# ---------------------------------------------------------------------------
@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    schedule = await _get_schedule_or_404(schedule_id, tenant, db)
    await db.delete(schedule)
    await db.flush()
    return None
