"""Exception management endpoints — list, update, bulk resolve."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import NotFoundError
from app.models.matching import Exception_
from app.models.tenant import Tenant
from app.utils.pagination import paginate

router = APIRouter()


class ExceptionUpdate(BaseModel):
    status: str | None = None
    severity: str | None = None
    assigned_to: str | None = None
    resolution_note: str | None = None


class BulkResolveRequest(BaseModel):
    exception_ids: list[UUID]
    resolution_note: str | None = None


class ExceptionResponse(BaseModel):
    id: UUID
    run_id: UUID
    side: str
    exception_type: str
    severity: str
    status: str
    assigned_to: str | None = None
    resolution_note: str | None = None
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    row_data: dict | None = None
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


@router.get("/")
async def list_exceptions(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    severity: str | None = None,
    side: str | None = None,
    run_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(Exception_)
        .where(Exception_.tenant_id == tenant.id)
        .order_by(Exception_.created_at.desc())
    )
    if status_filter:
        query = query.where(Exception_.status == status_filter)
    if severity:
        query = query.where(Exception_.severity == severity)
    if side:
        query = query.where(Exception_.side == side)
    if run_id:
        query = query.where(Exception_.run_id == run_id)

    return await paginate(db, query, page=page, page_size=page_size)


@router.get("/stats")
async def exception_stats(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(
            Exception_.status,
            func.count(Exception_.id).label("count"),
        )
        .where(Exception_.tenant_id == tenant.id)
        .group_by(Exception_.status)
    )
    stats = {row.status: row.count for row in result.all()}
    return {
        "open": stats.get("open", 0),
        "investigating": stats.get("investigating", 0),
        "resolved": stats.get("resolved", 0),
        "ignored": stats.get("ignored", 0),
        "total": sum(stats.values()),
    }


@router.patch("/{exception_id}")
async def update_exception(
    exception_id: UUID,
    payload: ExceptionUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Exception_).where(
            Exception_.id == exception_id,
            Exception_.tenant_id == tenant.id,
        )
    )
    exc = result.scalar_one_or_none()
    if not exc:
        raise NotFoundError("Exception")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(exc, key, value)

    if payload.status in ("resolved", "ignored"):
        exc.resolved_at = datetime.now(timezone.utc)
        exc.resolved_by = user.get("user_id")

    await db.flush()
    await db.refresh(exc)
    return exc


@router.post("/bulk-resolve", status_code=status.HTTP_200_OK)
async def bulk_resolve(
    payload: BulkResolveRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    resolved_count = 0
    now = datetime.now(timezone.utc)

    for exc_id in payload.exception_ids:
        result = await db.execute(
            select(Exception_).where(
                Exception_.id == exc_id,
                Exception_.tenant_id == tenant.id,
                Exception_.status.in_(["open", "investigating"]),
            )
        )
        exc = result.scalar_one_or_none()
        if exc:
            exc.status = "resolved"
            exc.resolved_at = now
            exc.resolved_by = user.get("user_id")
            if payload.resolution_note:
                exc.resolution_note = payload.resolution_note
            resolved_count += 1

    await db.flush()
    return {"resolved_count": resolved_count, "total_requested": len(payload.exception_ids)}
