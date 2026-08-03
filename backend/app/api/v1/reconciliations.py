"""Reconciliation endpoints — CRUD, rules, runs, matched/unmatched/exceptions."""

import logging
import math
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.data_source import DataSourceRow
from app.models.matching import Exception_, MatchPair, MatchPairItem, ReconRun
from app.models.reconciliation import Reconciliation, ReconRule, ReconRuleCondition
from app.models.tenant import Tenant
from app.schemas.common import PaginatedResponse
from app.schemas.reconciliation import (
    ExceptionResponse,
    MatchPairResponse,
    ReconRuleCreate,
    ReconciliationCreate,
    ReconciliationResponse,
    ReconciliationUpdate,
    ReconRunResponse,
)
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)

router = APIRouter()


# ---- internal helpers -------------------------------------------------------

async def _get_recon_or_404(
    recon_id: UUID,
    tenant: Tenant,
    db: AsyncSession,
    *,
    load_rules: bool = False,
) -> Reconciliation:
    query = select(Reconciliation).where(
        Reconciliation.id == recon_id,
        Reconciliation.tenant_id == tenant.id,
        Reconciliation.deleted_at.is_(None),
    )
    if load_rules:
        query = query.options(
            selectinload(Reconciliation.rules).selectinload(ReconRule.conditions)
        )
    result = await db.execute(query)
    recon = result.scalar_one_or_none()
    if not recon:
        raise NotFoundError("Reconciliation")
    return recon


async def _get_run_or_404(
    recon_id: UUID,
    run_id: UUID,
    tenant: Tenant,
    db: AsyncSession,
) -> ReconRun:
    result = await db.execute(
        select(ReconRun).where(
            ReconRun.id == run_id,
            ReconRun.reconciliation_id == recon_id,
            ReconRun.tenant_id == tenant.id,
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise NotFoundError("Reconciliation run")
    return run


# ---------------------------------------------------------------------------
# GET / — list reconciliations (paginated)
# ---------------------------------------------------------------------------
@router.get("/", response_model=PaginatedResponse[ReconciliationResponse])
async def list_reconciliations(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(Reconciliation)
        .where(
            Reconciliation.tenant_id == tenant.id,
            Reconciliation.deleted_at.is_(None),
            Reconciliation.status != "template",
        )
        .order_by(Reconciliation.created_at.desc())
    )
    return await paginate(db, query, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# POST / — create reconciliation with rules
# ---------------------------------------------------------------------------
@router.post("/", response_model=ReconciliationResponse, status_code=status.HTTP_201_CREATED)
async def create_reconciliation(
    payload: ReconciliationCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    recon = Reconciliation(
        tenant_id=tenant.id,
        name=payload.name,
        description=payload.description,
        recon_type=payload.recon_type,
        left_source_id=payload.left_source_id,
        right_source_id=payload.right_source_id,
        left_source_label=payload.left_source_label or "Source A",
        right_source_label=payload.right_source_label or "Source B",
        tolerance_amount=payload.tolerance_amount,
        tolerance_percent=payload.tolerance_percent,
        status="draft",
    )
    db.add(recon)
    await db.flush()

    # Create rules and their conditions
    for rule_payload in payload.rules:
        rule = ReconRule(
            tenant_id=tenant.id,
            reconciliation_id=recon.id,
            name=rule_payload.name or f"Rule {rule_payload.priority}",
            match_type=rule_payload.match_type,
            priority=rule_payload.priority,
        )
        db.add(rule)
        await db.flush()

        for cond_payload in rule_payload.conditions:
            condition = ReconRuleCondition(
                rule_id=rule.id,
                left_column=cond_payload.left_column,
                right_column=cond_payload.right_column,
                comparison=cond_payload.comparison,
                tolerance_value=cond_payload.tolerance_value,
                fuzzy_threshold=cond_payload.fuzzy_threshold,
                is_key=cond_payload.is_key,
            )
            db.add(condition)

    await db.flush()
    await db.refresh(recon)
    return recon


# ---------------------------------------------------------------------------
# GET /{id} — get reconciliation detail with rules
# ---------------------------------------------------------------------------
@router.get("/{recon_id}", response_model=ReconciliationResponse)
async def get_reconciliation(
    recon_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    return await _get_recon_or_404(recon_id, tenant, db, load_rules=True)


# ---------------------------------------------------------------------------
# PATCH /{id} — update reconciliation
# ---------------------------------------------------------------------------
@router.patch("/{recon_id}", response_model=ReconciliationResponse)
async def update_reconciliation(
    recon_id: UUID,
    payload: ReconciliationUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    recon = await _get_recon_or_404(recon_id, tenant, db)
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(recon, key, value)
    await db.flush()
    await db.refresh(recon)
    return recon


# ---------------------------------------------------------------------------
# DELETE /{id} — soft delete
# ---------------------------------------------------------------------------
@router.delete("/{recon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reconciliation(
    recon_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    recon = await _get_recon_or_404(recon_id, tenant, db)
    recon.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return None


# ---------------------------------------------------------------------------
# POST /{id}/rules — add a rule
# ---------------------------------------------------------------------------
@router.post(
    "/{recon_id}/rules",
    response_model=ReconciliationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_rule(
    recon_id: UUID,
    payload: ReconRuleCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    recon = await _get_recon_or_404(recon_id, tenant, db)

    rule = ReconRule(
        tenant_id=tenant.id,
        reconciliation_id=recon.id,
        name=payload.name or f"Rule {payload.priority}",
        match_type=payload.match_type,
        priority=payload.priority,
    )
    db.add(rule)
    await db.flush()

    for cond_payload in payload.conditions:
        condition = ReconRuleCondition(
            rule_id=rule.id,
            left_column=cond_payload.left_column,
            right_column=cond_payload.right_column,
            comparison=cond_payload.comparison,
            tolerance_value=cond_payload.tolerance_value,
            fuzzy_threshold=cond_payload.fuzzy_threshold,
            is_key=cond_payload.is_key,
        )
        db.add(condition)

    await db.flush()
    # Reload with rules
    return await _get_recon_or_404(recon_id, tenant, db, load_rules=True)


# ---------------------------------------------------------------------------
# DELETE /{id}/rules/{rule_id} — delete a rule
# ---------------------------------------------------------------------------
@router.delete("/{recon_id}/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    recon_id: UUID,
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Verify recon belongs to tenant
    await _get_recon_or_404(recon_id, tenant, db)

    result = await db.execute(
        select(ReconRule).where(
            ReconRule.id == rule_id,
            ReconRule.reconciliation_id == recon_id,
            ReconRule.tenant_id == tenant.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise NotFoundError("Reconciliation rule")

    await db.delete(rule)
    await db.flush()
    return None


# ---------------------------------------------------------------------------
# POST /{id}/run — trigger a reconciliation run
# ---------------------------------------------------------------------------
@router.post("/{recon_id}/run", response_model=ReconRunResponse, status_code=status.HTTP_201_CREATED)
async def trigger_run(
    recon_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    recon = await _get_recon_or_404(recon_id, tenant, db)

    # Update recon status to active/processing
    if recon.status == "draft":
        recon.status = "active"
        await db.flush()

    run = ReconRun(
        reconciliation_id=recon.id,
        tenant_id=tenant.id,
        status="pending",
        triggered_by=user.get("user_id"),
    )
    db.add(run)
    await db.flush()
    await db.refresh(run)

    # Queue Celery task (best-effort — worker may not be running)
    try:
        from app.tasks.reconciliation_tasks import run_reconciliation
        run_reconciliation.delay(str(recon.id), str(run.id))
    except Exception:
        logger.warning("Could not enqueue reconciliation task for run %s (Celery may be offline)", run.id)

    return run


# ---------------------------------------------------------------------------
# GET /{id}/runs — list run history
# ---------------------------------------------------------------------------
@router.get("/{recon_id}/runs", response_model=PaginatedResponse[ReconRunResponse])
async def list_runs(
    recon_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    await _get_recon_or_404(recon_id, tenant, db)

    query = (
        select(ReconRun)
        .where(ReconRun.reconciliation_id == recon_id, ReconRun.tenant_id == tenant.id)
        .order_by(ReconRun.created_at.desc())
    )
    return await paginate(db, query, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# GET /{id}/runs/{run_id} — get run summary
# ---------------------------------------------------------------------------
@router.get("/{recon_id}/runs/{run_id}", response_model=ReconRunResponse)
async def get_run(
    recon_id: UUID,
    run_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    return await _get_run_or_404(recon_id, run_id, tenant, db)


# ---------------------------------------------------------------------------
# GET /{id}/runs/{run_id}/matched — matched pairs (paginated)
# ---------------------------------------------------------------------------
@router.get("/{recon_id}/runs/{run_id}/matched", response_model=PaginatedResponse[MatchPairResponse])
async def list_matched(
    recon_id: UUID,
    run_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    await _get_run_or_404(recon_id, run_id, tenant, db)

    from sqlalchemy import func as sa_func

    # Count total
    count_result = await db.execute(
        select(sa_func.count(MatchPair.id)).where(
            MatchPair.run_id == run_id, MatchPair.tenant_id == tenant.id
        )
    )
    total = count_result.scalar_one()

    # 1. Fetch the page of match pairs
    result = await db.execute(
        select(MatchPair)
        .where(MatchPair.run_id == run_id, MatchPair.tenant_id == tenant.id)
        .order_by(MatchPair.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    pairs = result.scalars().all()
    pair_ids = [p.id for p in pairs]

    # 2. Batch-fetch ALL match pair items for this page
    all_items = (
        await db.execute(
            select(MatchPairItem).where(MatchPairItem.match_pair_id.in_(pair_ids))
        )
    ).scalars().all() if pair_ids else []

    # 3. Collect ALL row IDs and batch-fetch rows
    row_ids = {item.data_source_row_id for item in all_items}
    all_rows = (
        await db.execute(
            select(DataSourceRow).where(DataSourceRow.id.in_(row_ids))
        )
    ).scalars().all() if row_ids else []
    row_map = {r.id: r.data or {} for r in all_rows}

    # 4. Group items by pair
    items_by_pair: dict[UUID, list] = defaultdict(list)
    for item in all_items:
        items_by_pair[item.match_pair_id].append(item)

    # 5. Build enriched results without additional queries
    enriched = []
    for pair in pairs:
        left_data: dict = {}
        right_data: dict = {}
        for item in items_by_pair.get(pair.id, []):
            data = row_map.get(item.data_source_row_id, {})
            if item.side == "left":
                left_data = data
            else:
                right_data = data

        enriched.append({
            "id": pair.id,
            "match_status": pair.match_status,
            "confidence_score": float(pair.confidence_score) if pair.confidence_score else None,
            "left_amount": float(pair.left_amount) if pair.left_amount else None,
            "right_amount": float(pair.right_amount) if pair.right_amount else None,
            "difference": float(pair.difference) if pair.difference else None,
            "left_data": left_data,
            "right_data": right_data,
        })

    return {
        "items": enriched,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 0,
    }


# ---------------------------------------------------------------------------
# GET /{id}/runs/{run_id}/unmatched — unmatched items (paginated, filter by side)
# ---------------------------------------------------------------------------
@router.get("/{recon_id}/runs/{run_id}/unmatched", response_model=PaginatedResponse[ExceptionResponse])
async def list_unmatched(
    recon_id: UUID,
    run_id: UUID,
    side: str | None = Query(None, description="Filter by side: 'left' or 'right'"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    await _get_run_or_404(recon_id, run_id, tenant, db)

    from sqlalchemy import func as sa_func

    query = (
        select(Exception_)
        .where(
            Exception_.run_id == run_id,
            Exception_.tenant_id == tenant.id,
            Exception_.exception_type == "unmatched",
        )
        .order_by(Exception_.created_at.desc())
    )
    if side:
        query = query.where(Exception_.side == side)

    count_q = select(sa_func.count(Exception_.id)).where(
        Exception_.run_id == run_id, Exception_.tenant_id == tenant.id, Exception_.exception_type == "unmatched"
    )
    if side:
        count_q = count_q.where(Exception_.side == side)
    total = (await db.execute(count_q)).scalar_one()

    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    exceptions = result.scalars().all()

    # Batch-fetch all referenced DataSourceRows
    row_ids = {e.data_source_row_id for e in exceptions if e.data_source_row_id}
    all_rows = (
        await db.execute(
            select(DataSourceRow).where(DataSourceRow.id.in_(row_ids))
        )
    ).scalars().all() if row_ids else []
    row_map = {r.id: r.data or {} for r in all_rows}

    enriched = []
    for exc in exceptions:
        row_data = row_map.get(exc.data_source_row_id, {}) if exc.data_source_row_id else {}

        enriched.append({
            "id": exc.id,
            "side": exc.side,
            "exception_type": exc.exception_type,
            "severity": exc.severity,
            "status": exc.status,
            "assigned_to": exc.assigned_to,
            "resolution_note": exc.resolution_note,
            "row_data": row_data,
            "created_at": exc.created_at,
        })

    return {
        "items": enriched,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 0,
    }


# ---------------------------------------------------------------------------
# GET /{id}/runs/{run_id}/exceptions — exceptions (paginated, filter by status/severity)
# ---------------------------------------------------------------------------
@router.get("/{recon_id}/runs/{run_id}/exceptions", response_model=PaginatedResponse[ExceptionResponse])
async def list_exceptions(
    recon_id: UUID,
    run_id: UUID,
    status_filter: str | None = Query(None, alias="status", description="Filter by status"),
    severity: str | None = Query(None, description="Filter by severity"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    await _get_run_or_404(recon_id, run_id, tenant, db)

    query = (
        select(Exception_)
        .where(Exception_.run_id == run_id, Exception_.tenant_id == tenant.id)
        .order_by(Exception_.created_at.desc())
    )
    if status_filter:
        query = query.where(Exception_.status == status_filter)
    if severity:
        query = query.where(Exception_.severity == severity)
    return await paginate(db, query, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# GET /{id}/runs/{run_id}/results — unified reconciliation results
# ---------------------------------------------------------------------------
@router.get("/{recon_id}/runs/{run_id}/results")
async def list_unified_results(
    recon_id: UUID,
    run_id: UUID,
    search: str | None = Query(None, description="Search across all fields"),
    recon_status: str | None = Query(None, description="Filter by status: reconciled, tolerance, unreconciled, pending_review, informative"),
    sort_by: str | None = Query(None, description="Column name to sort by"),
    sort_order: str = Query("asc", description="Sort direction: 'asc' or 'desc'"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    await _get_run_or_404(recon_id, run_id, tenant, db)

    rows: list[dict] = []

    # 1. Fetch all matched pairs with their row data (batch — no N+1)
    if not recon_status or recon_status in ("reconciled", "tolerance"):
        pairs_result = await db.execute(
            select(MatchPair).where(MatchPair.run_id == run_id, MatchPair.tenant_id == tenant.id)
        )
        pairs = pairs_result.scalars().all()
        pair_ids = [p.id for p in pairs]

        # Batch-fetch all match pair items
        all_items = (
            await db.execute(
                select(MatchPairItem).where(MatchPairItem.match_pair_id.in_(pair_ids))
            )
        ).scalars().all() if pair_ids else []

        # Collect all row IDs and batch-fetch DataSourceRows
        item_row_ids = {item.data_source_row_id for item in all_items}

        # We'll also collect exception row IDs below to do one combined fetch
        items_by_pair: dict[UUID, list] = defaultdict(list)
        for item in all_items:
            items_by_pair[item.match_pair_id].append(item)
    else:
        pairs = []
        item_row_ids = set()
        items_by_pair = {}

    # 2. Fetch all exception rows (left + right) for unreconciled/informative
    exc_list: list = []
    exc_row_ids: set = set()
    if not recon_status or recon_status in ("unreconciled", "informative"):
        exc_types = ["unmatched", "informative"]
        exc_result = await db.execute(
            select(Exception_).where(
                Exception_.run_id == run_id,
                Exception_.tenant_id == tenant.id,
                Exception_.exception_type.in_(exc_types),
            )
        )
        exc_list = exc_result.scalars().all()
        exc_row_ids = {e.data_source_row_id for e in exc_list if e.data_source_row_id}

    # 3. Single batch fetch of ALL DataSourceRows needed
    all_needed_row_ids = item_row_ids | exc_row_ids
    if all_needed_row_ids:
        all_ds_rows = (
            await db.execute(
                select(DataSourceRow).where(DataSourceRow.id.in_(all_needed_row_ids))
            )
        ).scalars().all()
        row_map = {r.id: r.data or {} for r in all_ds_rows}
    else:
        row_map = {}

    # 4. Build matched pair rows
    for pair in pairs:
        side_a: dict = {}
        side_b: dict = {}
        for item in items_by_pair.get(pair.id, []):
            data = row_map.get(item.data_source_row_id, {})
            if item.side == "left":
                side_a = data
            else:
                side_b = data

        pair_status = "tolerance" if pair.match_status == "partial" else "reconciled"
        if recon_status and pair_status != recon_status:
            continue

        rows.append({
            "id": str(pair.id),
            "type": "match",
            "status": pair_status,
            "side_a": side_a,
            "side_b": side_b,
            "confidence": float(pair.confidence_score) if pair.confidence_score else None,
            "difference": float(pair.difference) if pair.difference else None,
            "match_rule": pair.match_status,
            "assigned_to": None,
            "comment": None,
            "source_side": "both",
        })

    # 5. Build exception rows (left + right combined)
    for exc in exc_list:
        row_data = row_map.get(exc.data_source_row_id, {}) if exc.data_source_row_id else {}

        if exc.exception_type == "informative":
            exc_status = "informative"
        elif exc.status == "investigating":
            exc_status = "pending_review"
        else:
            exc_status = "unreconciled"

        if recon_status and exc_status != recon_status:
            continue

        rows.append({
            "id": str(exc.id),
            "type": "exception",
            "status": exc_status,
            "side_a": row_data if exc.side == "left" else None,
            "side_b": row_data if exc.side == "right" else None,
            "confidence": None,
            "difference": None,
            "match_rule": None,
            "assigned_to": exc.assigned_to,
            "comment": exc.resolution_note,
            "source_side": exc.side,
        })

    # 4. Apply search filter
    if search:
        search_lower = search.lower()
        filtered = []
        for row in rows:
            match = False
            for side_data in [row["side_a"], row["side_b"]]:
                if side_data:
                    for val in side_data.values():
                        if val is not None and search_lower in str(val).lower():
                            match = True
                            break
                if match:
                    break
            if match:
                filtered.append(row)
        rows = filtered

    # 5. Server-side sorting
    if sort_by:
        def get_sort_val(row):
            for side_data in [row.get("side_a"), row.get("side_b")]:
                if side_data and sort_by in side_data:
                    return side_data[sort_by] or ""
            return row.get(sort_by, "")
        rows.sort(key=get_sort_val, reverse=(sort_order == "desc"))

    # 6. Compute summary counts
    summary = {
        "total": len(rows),
        "reconciled": sum(1 for r in rows if r["status"] == "reconciled"),
        "tolerance": sum(1 for r in rows if r["status"] == "tolerance"),
        "unreconciled": sum(1 for r in rows if r["status"] == "unreconciled"),
        "pending_review": sum(1 for r in rows if r["status"] == "pending_review"),
        "informative": sum(1 for r in rows if r["status"] == "informative"),
    }

    # 7. Collect column names
    side_a_columns = []
    side_b_columns = []
    a_seen, b_seen = set(), set()
    for row in rows:
        if row["side_a"]:
            for k in row["side_a"]:
                if k not in a_seen and k not in ("_row_id", "_row_number"):
                    a_seen.add(k)
                    side_a_columns.append(k)
        if row["side_b"]:
            for k in row["side_b"]:
                if k not in b_seen and k not in ("_row_id", "_row_number"):
                    b_seen.add(k)
                    side_b_columns.append(k)

    # 8. Paginate
    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    page_rows = rows[start:end]

    return {
        "items": page_rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 0,
        "summary": summary,
        "side_a_columns": side_a_columns,
        "side_b_columns": side_b_columns,
    }


# ---------------------------------------------------------------------------
# PATCH /{id}/runs/{run_id}/results/{item_id} — update a result item
# ---------------------------------------------------------------------------
@router.patch("/{recon_id}/runs/{run_id}/results/{item_id}")
async def update_result_item(
    recon_id: UUID,
    run_id: UUID,
    item_id: UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    await _get_run_or_404(recon_id, run_id, tenant, db)

    # Try as exception first
    result = await db.execute(
        select(Exception_).where(Exception_.id == item_id, Exception_.tenant_id == tenant.id)
    )
    exc = result.scalar_one_or_none()
    if exc:
        if "status" in payload:
            exc.status = payload["status"]
        if "comment" in payload:
            exc.resolution_note = payload["comment"]
        if "assigned_to" in payload:
            exc.assigned_to = payload["assigned_to"]
        if payload.get("status") in ("resolved", "ignored"):
            from datetime import datetime, timezone
            exc.resolved_at = datetime.now(timezone.utc)
            exc.resolved_by = user.get("user_id")
        await db.flush()
        return {"ok": True, "id": str(item_id)}

    # Try as match pair
    result = await db.execute(
        select(MatchPair).where(MatchPair.id == item_id, MatchPair.tenant_id == tenant.id)
    )
    pair = result.scalar_one_or_none()
    if pair:
        if "status" in payload:
            pair.match_status = payload["status"]
        if "comment" in payload:
            pair.match_metadata = {**(pair.match_metadata or {}), "comment": payload["comment"]}
        await db.flush()
        return {"ok": True, "id": str(item_id)}

    raise NotFoundError("Result item")


# ---------------------------------------------------------------------------
# Manual Match / Unmatch — request bodies
# ---------------------------------------------------------------------------

class BalanceCheckRequest(BaseModel):
    opening_balance: float
    expected_closing_balance: float
    amount_column: str
    side: str = "left"  # "left" or "right" — which source to use


class EliminationRequest(BaseModel):
    left_entity: str = "Entity A"
    right_entity: str = "Entity B"
    amount_column: str | None = None


# ---------------------------------------------------------------------------
# POST /{id}/runs/{run_id}/balance-check — balance reconciliation
# ---------------------------------------------------------------------------
@router.post("/{recon_id}/runs/{run_id}/balance-check")
async def balance_check(
    recon_id: UUID,
    run_id: UUID,
    payload: BalanceCheckRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Compute opening + credits - debits = closing and compare to expected."""
    await _get_run_or_404(recon_id, run_id, tenant, db)
    recon = await _get_recon_or_404(recon_id, tenant, db)

    source_id = recon.left_source_id if payload.side == "left" else recon.right_source_id
    if not source_id:
        raise BadRequestError(f"No {payload.side} source configured on this reconciliation")

    result = await db.execute(
        select(DataSourceRow)
        .where(
            DataSourceRow.data_source_id == source_id,
            DataSourceRow.tenant_id == tenant.id,
        )
        .order_by(DataSourceRow.row_number)
    )
    rows = result.scalars().all()

    total_credits = Decimal(0)
    total_debits = Decimal(0)
    for row in rows:
        raw_val = row.data.get(payload.amount_column)
        if raw_val is None:
            continue
        try:
            val = Decimal(str(raw_val))
        except Exception:
            continue
        if val >= 0:
            total_credits += val
        else:
            total_debits += abs(val)

    opening = Decimal(str(payload.opening_balance))
    computed_closing = opening + total_credits - total_debits
    expected = Decimal(str(payload.expected_closing_balance))
    difference = computed_closing - expected

    return {
        "opening_balance": float(opening),
        "total_credits": float(total_credits),
        "total_debits": float(total_debits),
        "computed_closing_balance": float(computed_closing),
        "expected_closing_balance": float(expected),
        "difference": float(difference),
        "is_balanced": abs(difference) < Decimal("0.01"),
        "rows_analyzed": len(rows),
    }


# ---------------------------------------------------------------------------
# POST /{id}/runs/{run_id}/elimination-entries — intercompany elimination
# ---------------------------------------------------------------------------
@router.post("/{recon_id}/runs/{run_id}/elimination-entries", status_code=status.HTTP_201_CREATED)
async def generate_elimination_entries(
    recon_id: UUID,
    run_id: UUID,
    payload: EliminationRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Generate intercompany elimination entries from matched pairs."""
    run = await _get_run_or_404(recon_id, run_id, tenant, db)
    recon = await _get_recon_or_404(recon_id, tenant, db)

    # Fetch matched pairs for this run
    pairs_result = await db.execute(
        select(MatchPair).where(
            MatchPair.run_id == run_id,
            MatchPair.tenant_id == tenant.id,
        )
    )
    pairs = pairs_result.scalars().all()

    if not pairs:
        return {"entries": [], "message": "No matched pairs found for elimination"}

    entries = []
    for pair in pairs:
        amount = pair.left_amount or pair.right_amount or Decimal(0)
        if amount == 0:
            continue

        entries.append({
            "match_pair_id": str(pair.id),
            "left_entity": payload.left_entity,
            "right_entity": payload.right_entity,
            "amount": float(amount),
            "elimination_lines": [
                {
                    "entity": payload.left_entity,
                    "account": "Intercompany Receivable",
                    "debit": 0,
                    "credit": float(amount),
                    "narration": f"Eliminate IC receivable from {payload.right_entity}",
                },
                {
                    "entity": payload.right_entity,
                    "account": "Intercompany Payable",
                    "debit": float(amount),
                    "credit": 0,
                    "narration": f"Eliminate IC payable to {payload.left_entity}",
                },
            ],
        })

    total_eliminated = sum(e["amount"] for e in entries)

    return {
        "reconciliation_id": str(recon_id),
        "run_id": str(run_id),
        "recon_type": recon.recon_type,
        "entries": entries,
        "total_pairs_eliminated": len(entries),
        "total_amount_eliminated": total_eliminated,
    }


class AutoResolveRule(BaseModel):
    type: str
    threshold: float | None = None
    days: int | None = None
    action: str = "resolve"


class AutoResolveRequest(BaseModel):
    rules: list[AutoResolveRule]


class ManualMatchRequest(BaseModel):
    left_exception_id: UUID
    right_exception_id: UUID


class UnmatchRequest(BaseModel):
    match_pair_id: UUID


# ---------------------------------------------------------------------------
# POST /{id}/runs/{run_id}/manual-match — manually pair two unreconciled records
# ---------------------------------------------------------------------------
@router.post(
    "/{recon_id}/runs/{run_id}/manual-match",
    status_code=status.HTTP_201_CREATED,
)
async def manual_match(
    recon_id: UUID,
    run_id: UUID,
    payload: ManualMatchRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Manually pair a left and right unreconciled exception into a match."""
    run = await _get_run_or_404(recon_id, run_id, tenant, db)

    # 1. Fetch both exceptions and verify ownership
    left_exc_result = await db.execute(
        select(Exception_).where(
            Exception_.id == payload.left_exception_id,
            Exception_.run_id == run_id,
            Exception_.tenant_id == tenant.id,
        )
    )
    left_exc = left_exc_result.scalar_one_or_none()
    if not left_exc:
        raise NotFoundError("Left exception")

    right_exc_result = await db.execute(
        select(Exception_).where(
            Exception_.id == payload.right_exception_id,
            Exception_.run_id == run_id,
            Exception_.tenant_id == tenant.id,
        )
    )
    right_exc = right_exc_result.scalar_one_or_none()
    if not right_exc:
        raise NotFoundError("Right exception")

    # 2. Verify sides
    if left_exc.side != "left":
        raise BadRequestError("left_exception_id must reference a 'left' side exception")
    if right_exc.side != "right":
        raise BadRequestError("right_exception_id must reference a 'right' side exception")

    # 3. Verify both are still open / unresolved
    if left_exc.status == "resolved":
        raise BadRequestError("Left exception is already resolved")
    if right_exc.status == "resolved":
        raise BadRequestError("Right exception is already resolved")

    # 4. Get the DataSourceRow data for both
    left_row_result = await db.execute(
        select(DataSourceRow).where(DataSourceRow.id == left_exc.data_source_row_id)
    )
    left_row = left_row_result.scalar_one_or_none()

    right_row_result = await db.execute(
        select(DataSourceRow).where(DataSourceRow.id == right_exc.data_source_row_id)
    )
    right_row = right_row_result.scalar_one_or_none()

    # 5. Create a new MatchPair
    match_pair = MatchPair(
        run_id=run_id,
        tenant_id=tenant.id,
        match_status="manual_match",
        confidence_score=Decimal("1.0"),
        match_metadata={"manual": True, "matched_by": _user.get("user_id")},
    )
    db.add(match_pair)
    await db.flush()

    # 6. Create MatchPairItems linking both rows
    left_item = MatchPairItem(
        match_pair_id=match_pair.id,
        data_source_row_id=left_exc.data_source_row_id,
        side="left",
    )
    right_item = MatchPairItem(
        match_pair_id=match_pair.id,
        data_source_row_id=right_exc.data_source_row_id,
        side="right",
    )
    db.add(left_item)
    db.add(right_item)

    # 7. Update both exceptions to resolved
    left_exc.status = "resolved"
    left_exc.resolution_note = "Manual match"
    left_exc.resolved_at = datetime.now(timezone.utc)
    left_exc.resolved_by = _user.get("user_id")

    right_exc.status = "resolved"
    right_exc.resolution_note = "Manual match"
    right_exc.resolved_at = datetime.now(timezone.utc)
    right_exc.resolved_by = _user.get("user_id")

    # 8. Update ReconRun counts
    run.matched_count = (run.matched_count or 0) + 1
    run.unmatched_left = max((run.unmatched_left or 0) - 1, 0)
    run.unmatched_right = max((run.unmatched_right or 0) - 1, 0)
    total_rows = (run.left_row_count or 0) + (run.right_row_count or 0)
    if total_rows > 0:
        run.match_rate = Decimal(str(
            round(((run.matched_count or 0) * 2) / total_rows * 100, 4)
        ))

    await db.flush()

    return {
        "id": str(match_pair.id),
        "match_status": match_pair.match_status,
        "confidence_score": float(match_pair.confidence_score),
        "left_data": left_row.data if left_row else {},
        "right_data": right_row.data if right_row else {},
        "left_exception_id": str(left_exc.id),
        "right_exception_id": str(right_exc.id),
    }


# ---------------------------------------------------------------------------
# POST /{id}/runs/{run_id}/unmatch — break apart an existing match
# ---------------------------------------------------------------------------
@router.post("/{recon_id}/runs/{run_id}/unmatch")
async def unmatch(
    recon_id: UUID,
    run_id: UUID,
    payload: UnmatchRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Break apart an existing match pair, restoring exceptions for each row."""
    run = await _get_run_or_404(recon_id, run_id, tenant, db)

    # 1. Verify the match pair exists and belongs to this run/tenant
    pair_result = await db.execute(
        select(MatchPair).where(
            MatchPair.id == payload.match_pair_id,
            MatchPair.run_id == run_id,
            MatchPair.tenant_id == tenant.id,
        )
    )
    pair = pair_result.scalar_one_or_none()
    if not pair:
        raise NotFoundError("Match pair")

    # 2. Get the MatchPairItems to find the DataSourceRow IDs and sides
    items_result = await db.execute(
        select(MatchPairItem).where(MatchPairItem.match_pair_id == pair.id)
    )
    items = items_result.scalars().all()

    # 3. Create Exception_ records for each formerly-matched row
    created_exceptions = []
    for item in items:
        exc = Exception_(
            run_id=run_id,
            tenant_id=tenant.id,
            data_source_row_id=item.data_source_row_id,
            side=item.side,
            exception_type="unmatched",
            severity="medium",
            status="open",
        )
        db.add(exc)
        created_exceptions.append(exc)

    # 4. Delete the MatchPairItems and the MatchPair (cascade handles items)
    await db.delete(pair)

    # 5. Update the ReconRun counts
    run.matched_count = max((run.matched_count or 0) - 1, 0)
    left_added = sum(1 for e in created_exceptions if e.side == "left")
    right_added = sum(1 for e in created_exceptions if e.side == "right")
    run.unmatched_left = (run.unmatched_left or 0) + left_added
    run.unmatched_right = (run.unmatched_right or 0) + right_added
    total_rows = (run.left_row_count or 0) + (run.right_row_count or 0)
    if total_rows > 0:
        run.match_rate = Decimal(str(
            round(((run.matched_count or 0) * 2) / total_rows * 100, 4)
        ))

    await db.flush()

    return {
        "ok": True,
        "unmatched_pair_id": str(payload.match_pair_id),
        "exceptions_created": len(created_exceptions),
    }


# ---------------------------------------------------------------------------
# POST /{id}/auto-resolve — auto-resolve exceptions based on rules
# ---------------------------------------------------------------------------
@router.post("/{recon_id}/auto-resolve")
async def auto_resolve(
    recon_id: UUID,
    payload: AutoResolveRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Auto-resolve exceptions based on provided rules.

    Supported rule types:
    - amount_below: resolve exceptions where the row amount is below a threshold
    - age_above: resolve exceptions older than a given number of days
    - duplicate: resolve exceptions categorized as duplicates
    """
    recon = await _get_recon_or_404(recon_id, tenant, db)

    # Gather all run IDs for this reconciliation
    from app.models.matching import ReconRun
    runs_result = await db.execute(
        select(ReconRun).where(
            ReconRun.reconciliation_id == recon_id,
            ReconRun.tenant_id == tenant.id,
        )
    )
    runs = {r.id: r for r in runs_result.scalars().all()}

    # Load all open exceptions across runs of this reconciliation
    exc_result = await db.execute(
        select(Exception_).where(
            Exception_.run_id.in_(list(runs.keys())),
            Exception_.tenant_id == tenant.id,
            Exception_.status == "open",
        )
    )
    open_exceptions = exc_result.scalars().all()

    # Batch-fetch all row data needed for amount-based rules
    exc_row_ids = {exc.data_source_row_id for exc in open_exceptions if exc.data_source_row_id}
    row_data_cache: dict[UUID, dict] = {}
    if exc_row_ids:
        all_rows = (
            await db.execute(
                select(DataSourceRow).where(DataSourceRow.id.in_(exc_row_ids))
            )
        ).scalars().all()
        row_data_cache = {r.id: r.data for r in all_rows if r.data}

    now = datetime.now(timezone.utc)
    resolved_count = 0
    rules_applied = []

    for rule in payload.rules:
        rule_resolved = 0

        for exc in open_exceptions:
            if exc.status != "open":
                continue  # already resolved by a previous rule in this batch

            matched = False

            if rule.type == "amount_below" and rule.threshold is not None:
                row_d = row_data_cache.get(exc.data_source_row_id, {})
                for col, val in row_d.items():
                    if any(kw in col.lower() for kw in ("amount", "total", "value", "balance", "sum")):
                        try:
                            if abs(float(val)) < rule.threshold:
                                matched = True
                                break
                        except (TypeError, ValueError):
                            continue

            elif rule.type == "age_above" and rule.days is not None:
                days_old = (now - exc.created_at).days if exc.created_at else 0
                if days_old > rule.days:
                    matched = True

            elif rule.type == "duplicate":
                if exc.exception_type == "duplicate":
                    matched = True

            if matched and rule.action == "resolve":
                exc.status = "resolved"
                exc.resolution_note = f"Auto-resolved by rule: {rule.type}"
                exc.resolved_at = now
                exc.resolved_by = user.get("user_id")
                rule_resolved += 1

        resolved_count += rule_resolved
        rules_applied.append({
            "type": rule.type,
            "resolved": rule_resolved,
        })

    # Update ReconRun exception counts
    for run_id, run in runs.items():
        open_left = 0
        open_right = 0
        for exc in open_exceptions:
            if exc.run_id == run_id and exc.status == "open":
                if exc.side == "left":
                    open_left += 1
                else:
                    open_right += 1
        run.unmatched_left = open_left
        run.unmatched_right = open_right
        run.exception_count = open_left + open_right

    await db.flush()

    return {
        "resolved_count": resolved_count,
        "rules_applied": rules_applied,
    }


# ---------------------------------------------------------------------------
# GET /{id}/suggested-rules — AI-suggested rules based on manual match patterns
# ---------------------------------------------------------------------------
@router.get("/{recon_id}/suggested-rules")
async def suggested_rules(
    recon_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Analyze manual matches to suggest new reconciliation rules.

    Examines all manually-matched pairs for this reconciliation, identifies
    which column pairs are consistently identical, and returns them as
    candidate rules sorted by frequency and confidence.
    """
    await _get_recon_or_404(recon_id, tenant, db)

    from app.services.match_learning import analyze_manual_matches
    suggestions = await analyze_manual_matches(db, recon_id)

    return {
        "reconciliation_id": str(recon_id),
        "total_suggestions": len(suggestions),
        "suggestions": suggestions,
    }
