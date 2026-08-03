"""Segment endpoints — create, list, update, delete segments with filter rules."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import NotFoundError
from app.models.segment import Segment, SegmentRule
from app.models.tenant import Tenant
from app.schemas.common import PaginatedResponse
from app.schemas.segment import SegmentCreate, SegmentResponse
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)

router = APIRouter()


# ---- internal helper --------------------------------------------------------

async def _get_segment_or_404(
    segment_id: UUID,
    tenant: Tenant,
    db: AsyncSession,
) -> Segment:
    result = await db.execute(
        select(Segment)
        .options(selectinload(Segment.rules))
        .where(Segment.id == segment_id, Segment.tenant_id == tenant.id)
    )
    segment = result.scalar_one_or_none()
    if not segment:
        raise NotFoundError("Segment")
    return segment


# ---------------------------------------------------------------------------
# GET / — list segments
# ---------------------------------------------------------------------------
@router.get("/", response_model=PaginatedResponse[SegmentResponse])
async def list_segments(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    reconciliation_id: UUID | None = Query(None, description="Filter by reconciliation"),
    data_source_id: UUID | None = Query(None, description="Filter by data source"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(Segment)
        .where(Segment.tenant_id == tenant.id)
        .order_by(Segment.created_at.desc())
    )
    if reconciliation_id:
        query = query.where(Segment.reconciliation_id == reconciliation_id)
    if data_source_id:
        query = query.where(Segment.data_source_id == data_source_id)
    return await paginate(db, query, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# POST / — create segment with rules
# ---------------------------------------------------------------------------
@router.post("/", response_model=SegmentResponse, status_code=status.HTTP_201_CREATED)
async def create_segment(
    payload: SegmentCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    segment = Segment(
        tenant_id=tenant.id,
        name=payload.name,
        description=payload.description,
        reconciliation_id=payload.reconciliation_id,
        data_source_id=payload.data_source_id,
    )
    db.add(segment)
    await db.flush()

    for rule_payload in payload.rules:
        rule = SegmentRule(
            segment_id=segment.id,
            tenant_id=tenant.id,
            source_side=rule_payload.source_side,
            column_name=rule_payload.column_name,
            operator=rule_payload.operator,
            value=rule_payload.value if isinstance(rule_payload.value, dict) else {"v": rule_payload.value},
            logic_group=rule_payload.logic_group,
        )
        db.add(rule)

    await db.flush()
    return await _get_segment_or_404(segment.id, tenant, db)


# ---------------------------------------------------------------------------
# GET /{id} — get segment detail
# ---------------------------------------------------------------------------
@router.get("/{segment_id}", response_model=SegmentResponse)
async def get_segment(
    segment_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    return await _get_segment_or_404(segment_id, tenant, db)


# ---------------------------------------------------------------------------
# PATCH /{id} — update segment
# ---------------------------------------------------------------------------
@router.patch("/{segment_id}", response_model=SegmentResponse)
async def update_segment(
    segment_id: UUID,
    payload: SegmentCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    segment = await _get_segment_or_404(segment_id, tenant, db)

    segment.name = payload.name
    segment.description = payload.description
    segment.reconciliation_id = payload.reconciliation_id
    segment.data_source_id = payload.data_source_id

    # Replace rules: delete existing, create new
    for existing_rule in segment.rules:
        await db.delete(existing_rule)
    await db.flush()

    for rule_payload in payload.rules:
        rule = SegmentRule(
            segment_id=segment.id,
            tenant_id=tenant.id,
            source_side=rule_payload.source_side,
            column_name=rule_payload.column_name,
            operator=rule_payload.operator,
            value=rule_payload.value if isinstance(rule_payload.value, dict) else {"v": rule_payload.value},
            logic_group=rule_payload.logic_group,
        )
        db.add(rule)

    await db.flush()
    return await _get_segment_or_404(segment.id, tenant, db)


# ---------------------------------------------------------------------------
# DELETE /{id} — delete segment
# ---------------------------------------------------------------------------
@router.delete("/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_segment(
    segment_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    segment = await _get_segment_or_404(segment_id, tenant, db)
    await db.delete(segment)
    await db.flush()
    return None
