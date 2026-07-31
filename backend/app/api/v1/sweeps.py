"""Sweeps, compensations, and consolidations — Tier 2 implementations."""

import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.data_source import DataSourceRow
from app.models.matching import Exception_, MatchPair, MatchPairItem, ReconRun
from app.models.reconciliation import Reconciliation
from app.models.sweep import Compensation, Consolidation, Sweep
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas — Sweeps
# ---------------------------------------------------------------------------
class SweepCreate(BaseModel):
    reconciliation_id: UUID
    name: str = Field(..., min_length=1, max_length=255)
    sweep_type: str = Field(..., description="auto_match | threshold | aging")
    rules: dict = Field(default_factory=dict)
    description: str | None = None


class SweepResponse(BaseModel):
    id: UUID
    reconciliation_id: UUID
    name: str
    sweep_type: str | None = None
    rules: dict | None = None
    description: str | None = None
    is_active: bool = True
    created_at: str | None = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Pydantic schemas — Compensations
# ---------------------------------------------------------------------------
class CompensationCreate(BaseModel):
    reconciliation_id: UUID
    name: str = Field(..., min_length=1, max_length=255)
    compensation_type: str = Field(..., description="write_off | adjustment | reclassification")
    threshold_amount: float | None = None
    auto_apply: bool = False
    rules: dict = Field(default_factory=dict)


class CompensationResponse(BaseModel):
    id: UUID
    reconciliation_id: UUID
    name: str
    compensation_type: str | None = None
    threshold_amount: float | None = None
    auto_apply: bool = False
    rules: dict | None = None
    created_at: str | None = None

    class Config:
        from_attributes = True


# ===========================================================================
# Sweeps
# ===========================================================================


# ---------------------------------------------------------------------------
# GET / — list sweeps (optionally filter by reconciliation_id)
# ---------------------------------------------------------------------------
@router.get("/")
async def list_sweeps(
    reconciliation_id: UUID | None = Query(None, description="Filter by reconciliation"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(Sweep)
        .where(Sweep.tenant_id == tenant.id)
        .order_by(Sweep.created_at.desc())
    )
    if reconciliation_id:
        query = query.where(Sweep.reconciliation_id == reconciliation_id)

    result = await db.execute(query)
    sweeps = result.scalars().all()

    return [
        {
            "id": str(s.id),
            "reconciliation_id": str(s.reconciliation_id),
            "name": s.name,
            "sweep_type": s.sweep_type,
            "rules": s.rules,
            "description": s.description,
            "is_active": s.is_active,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sweeps
    ]


# ---------------------------------------------------------------------------
# POST / — create a sweep configuration
# ---------------------------------------------------------------------------
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_sweep(
    payload: SweepCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Validate sweep_type
    valid_types = {"auto_match", "threshold", "aging"}
    if payload.sweep_type not in valid_types:
        raise BadRequestError(
            f"Invalid sweep_type '{payload.sweep_type}'. Must be one of: {', '.join(sorted(valid_types))}"
        )

    # Verify the reconciliation exists and belongs to tenant
    recon_result = await db.execute(
        select(Reconciliation).where(
            Reconciliation.id == payload.reconciliation_id,
            Reconciliation.tenant_id == tenant.id,
        )
    )
    if not recon_result.scalar_one_or_none():
        raise NotFoundError("Reconciliation")

    sweep = Sweep(
        tenant_id=tenant.id,
        reconciliation_id=payload.reconciliation_id,
        name=payload.name,
        sweep_type=payload.sweep_type,
        rules=payload.rules,
        description=payload.description,
    )
    db.add(sweep)
    await db.flush()
    await db.refresh(sweep)

    return {
        "id": str(sweep.id),
        "reconciliation_id": str(sweep.reconciliation_id),
        "name": sweep.name,
        "sweep_type": sweep.sweep_type,
        "rules": sweep.rules,
        "description": sweep.description,
        "is_active": sweep.is_active,
        "created_at": sweep.created_at.isoformat() if sweep.created_at else None,
    }


# ---------------------------------------------------------------------------
# POST /{id}/execute — execute a sweep on a specific run
# ---------------------------------------------------------------------------
@router.post("/{sweep_id}/execute")
async def execute_sweep(
    sweep_id: UUID,
    run_id: UUID = Query(..., description="The reconciliation run to sweep"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Load the sweep
    sweep_result = await db.execute(
        select(Sweep).where(
            Sweep.id == sweep_id,
            Sweep.tenant_id == tenant.id,
        )
    )
    sweep = sweep_result.scalar_one_or_none()
    if not sweep:
        raise NotFoundError("Sweep")

    # Verify the run exists
    run_result = await db.execute(
        select(ReconRun).where(
            ReconRun.id == run_id,
            ReconRun.tenant_id == tenant.id,
        )
    )
    run = run_result.scalar_one_or_none()
    if not run:
        raise NotFoundError("Reconciliation run")

    rules = sweep.rules or {}

    if sweep.sweep_type == "threshold":
        affected = await _execute_threshold_sweep(db, run, tenant, rules)
    elif sweep.sweep_type == "aging":
        affected = await _execute_aging_sweep(db, run, tenant, rules)
    elif sweep.sweep_type == "auto_match":
        affected = await _execute_auto_match_sweep(db, run, tenant, rules)
    else:
        raise BadRequestError(f"Unsupported sweep type: {sweep.sweep_type}")

    return {
        "sweep_id": str(sweep.id),
        "run_id": str(run_id),
        "sweep_type": sweep.sweep_type,
        "affected_count": affected,
        "status": "completed",
    }


# ---------------------------------------------------------------------------
# Sweep execution helpers
# ---------------------------------------------------------------------------

async def _execute_threshold_sweep(
    db: AsyncSession, run: ReconRun, tenant: Tenant, rules: dict
) -> int:
    """Find unmatched exceptions where the amount difference is below a threshold,
    then create MatchPairs for the closest pairs.
    """
    threshold_amount = Decimal(str(rules.get("threshold_amount", 0)))

    # Get all open exceptions for this run
    exc_result = await db.execute(
        select(Exception_).where(
            Exception_.run_id == run.id,
            Exception_.tenant_id == tenant.id,
            Exception_.status == "open",
            Exception_.exception_type == "unmatched",
        )
    )
    exceptions = list(exc_result.scalars().all())

    # Split by side
    left_exceptions = [e for e in exceptions if e.side == "left"]
    right_exceptions = [e for e in exceptions if e.side == "right"]

    # Load row data for amount comparison
    affected = 0
    matched_right_ids: set[UUID] = set()

    for left_exc in left_exceptions:
        left_row_result = await db.execute(
            select(DataSourceRow).where(DataSourceRow.id == left_exc.data_source_row_id)
        )
        left_row = left_row_result.scalar_one_or_none()
        if not left_row:
            continue

        left_amount = _extract_amount(left_row.data)
        if left_amount is None:
            continue

        best_right_exc = None
        best_diff = None

        for right_exc in right_exceptions:
            if right_exc.id in matched_right_ids:
                continue
            right_row_result = await db.execute(
                select(DataSourceRow).where(DataSourceRow.id == right_exc.data_source_row_id)
            )
            right_row = right_row_result.scalar_one_or_none()
            if not right_row:
                continue

            right_amount = _extract_amount(right_row.data)
            if right_amount is None:
                continue

            diff = abs(left_amount - right_amount)
            if diff <= threshold_amount:
                if best_diff is None or diff < best_diff:
                    best_right_exc = right_exc
                    best_diff = diff

        if best_right_exc is not None:
            # Create a match pair for these two
            pair = MatchPair(
                run_id=run.id,
                tenant_id=tenant.id,
                match_status="swept_threshold",
                confidence_score=Decimal("0.9"),
                left_amount=left_amount,
                right_amount=_extract_amount(
                    (await db.execute(
                        select(DataSourceRow).where(
                            DataSourceRow.id == best_right_exc.data_source_row_id
                        )
                    )).scalar_one().data
                ),
                difference=best_diff,
                match_metadata={"sweep_type": "threshold", "threshold": str(threshold_amount)},
            )
            db.add(pair)
            await db.flush()

            # Add pair items
            db.add(MatchPairItem(
                match_pair_id=pair.id,
                data_source_row_id=left_exc.data_source_row_id,
                side="left",
            ))
            db.add(MatchPairItem(
                match_pair_id=pair.id,
                data_source_row_id=best_right_exc.data_source_row_id,
                side="right",
            ))

            # Resolve the exceptions
            left_exc.status = "resolved"
            left_exc.resolution_note = f"Swept (threshold: {threshold_amount})"
            left_exc.resolved_at = datetime.now(timezone.utc)

            best_right_exc.status = "resolved"
            best_right_exc.resolution_note = f"Swept (threshold: {threshold_amount})"
            best_right_exc.resolved_at = datetime.now(timezone.utc)

            matched_right_ids.add(best_right_exc.id)
            affected += 1

    await db.flush()
    return affected


async def _execute_aging_sweep(
    db: AsyncSession, run: ReconRun, tenant: Tenant, rules: dict
) -> int:
    """Find unmatched items older than N days and mark them as resolved."""
    days = int(rules.get("days", 30))
    now = datetime.now(timezone.utc)

    exc_result = await db.execute(
        select(Exception_).where(
            Exception_.run_id == run.id,
            Exception_.tenant_id == tenant.id,
            Exception_.status == "open",
            Exception_.exception_type == "unmatched",
        )
    )
    exceptions = list(exc_result.scalars().all())

    affected = 0
    for exc in exceptions:
        age = (now - exc.created_at.replace(tzinfo=timezone.utc if exc.created_at.tzinfo is None else exc.created_at.tzinfo)).days
        if age >= days:
            exc.status = "resolved"
            exc.resolution_note = f"Swept (aging: >{days} days old)"
            exc.resolved_at = now
            affected += 1

    await db.flush()
    return affected


async def _execute_auto_match_sweep(
    db: AsyncSession, run: ReconRun, tenant: Tenant, rules: dict
) -> int:
    """Re-match unmatched items with relaxed tolerance from sweep rules."""
    relaxed_tolerance = Decimal(str(rules.get("tolerance", "0.05")))

    exc_result = await db.execute(
        select(Exception_).where(
            Exception_.run_id == run.id,
            Exception_.tenant_id == tenant.id,
            Exception_.status == "open",
            Exception_.exception_type == "unmatched",
        )
    )
    exceptions = list(exc_result.scalars().all())

    left_exceptions = [e for e in exceptions if e.side == "left"]
    right_exceptions = [e for e in exceptions if e.side == "right"]

    affected = 0
    matched_right_ids: set[UUID] = set()

    for left_exc in left_exceptions:
        left_row_result = await db.execute(
            select(DataSourceRow).where(DataSourceRow.id == left_exc.data_source_row_id)
        )
        left_row = left_row_result.scalar_one_or_none()
        if not left_row:
            continue

        left_amount = _extract_amount(left_row.data)
        if left_amount is None:
            continue

        best_right_exc = None
        best_diff = None

        for right_exc in right_exceptions:
            if right_exc.id in matched_right_ids:
                continue
            right_row_result = await db.execute(
                select(DataSourceRow).where(DataSourceRow.id == right_exc.data_source_row_id)
            )
            right_row = right_row_result.scalar_one_or_none()
            if not right_row:
                continue

            right_amount = _extract_amount(right_row.data)
            if right_amount is None:
                continue

            diff = abs(left_amount - right_amount)
            # Use percentage tolerance
            pct_diff = (diff / abs(left_amount) * 100) if left_amount != 0 else (Decimal(0) if diff == 0 else Decimal("100"))
            if pct_diff <= relaxed_tolerance * 100:
                if best_diff is None or diff < best_diff:
                    best_right_exc = right_exc
                    best_diff = diff

        if best_right_exc is not None:
            right_row_result = await db.execute(
                select(DataSourceRow).where(
                    DataSourceRow.id == best_right_exc.data_source_row_id
                )
            )
            right_row = right_row_result.scalar_one()
            right_amount = _extract_amount(right_row.data)

            confidence = float(1.0 - (float(best_diff) / float(left_amount) if left_amount else 0.0))
            confidence = max(0.0, min(1.0, confidence))

            pair = MatchPair(
                run_id=run.id,
                tenant_id=tenant.id,
                match_status="swept_auto_match",
                confidence_score=Decimal(str(round(confidence, 4))),
                left_amount=left_amount,
                right_amount=right_amount,
                difference=best_diff,
                match_metadata={"sweep_type": "auto_match", "tolerance": str(relaxed_tolerance)},
            )
            db.add(pair)
            await db.flush()

            db.add(MatchPairItem(
                match_pair_id=pair.id,
                data_source_row_id=left_exc.data_source_row_id,
                side="left",
            ))
            db.add(MatchPairItem(
                match_pair_id=pair.id,
                data_source_row_id=best_right_exc.data_source_row_id,
                side="right",
            ))

            left_exc.status = "resolved"
            left_exc.resolution_note = f"Swept (auto_match, tolerance: {relaxed_tolerance})"
            left_exc.resolved_at = datetime.now(timezone.utc)

            best_right_exc.status = "resolved"
            best_right_exc.resolution_note = f"Swept (auto_match, tolerance: {relaxed_tolerance})"
            best_right_exc.resolved_at = datetime.now(timezone.utc)

            matched_right_ids.add(best_right_exc.id)
            affected += 1

    await db.flush()
    return affected


def _extract_amount(data: dict) -> Decimal | None:
    """Try to extract a numeric amount from a row's data dict.

    Looks for common column names: amount, total, value, balance, debit, credit.
    """
    amount_keys = ["amount", "total", "value", "balance", "debit", "credit", "Amount", "Total", "Value"]
    for key in amount_keys:
        if key in data and data[key] is not None:
            try:
                return Decimal(str(data[key]))
            except (InvalidOperation, TypeError, ValueError):
                continue
    # Fall back to first numeric-looking value
    for val in data.values():
        if val is not None:
            try:
                return Decimal(str(val))
            except (InvalidOperation, TypeError, ValueError):
                continue
    return None


# ===========================================================================
# Compensations
# ===========================================================================


# ---------------------------------------------------------------------------
# GET /compensations — list compensations
# ---------------------------------------------------------------------------
@router.get("/compensations")
async def list_compensations(
    reconciliation_id: UUID | None = Query(None, description="Filter by reconciliation"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(Compensation)
        .where(Compensation.tenant_id == tenant.id)
        .order_by(Compensation.created_at.desc())
    )
    if reconciliation_id:
        query = query.where(Compensation.reconciliation_id == reconciliation_id)

    result = await db.execute(query)
    compensations = result.scalars().all()

    return [
        {
            "id": str(c.id),
            "reconciliation_id": str(c.reconciliation_id),
            "name": c.name,
            "compensation_type": c.compensation_type,
            "threshold_amount": float(c.threshold_amount) if c.threshold_amount is not None else None,
            "auto_apply": c.auto_apply,
            "rules": c.rules,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in compensations
    ]


# ---------------------------------------------------------------------------
# POST /compensations — create a compensation rule
# ---------------------------------------------------------------------------
@router.post("/compensations", status_code=status.HTTP_201_CREATED)
async def create_compensation(
    payload: CompensationCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Validate compensation_type
    valid_types = {"write_off", "adjustment", "reclassification"}
    if payload.compensation_type not in valid_types:
        raise BadRequestError(
            f"Invalid compensation_type '{payload.compensation_type}'. "
            f"Must be one of: {', '.join(sorted(valid_types))}"
        )

    # Verify the reconciliation exists and belongs to tenant
    recon_result = await db.execute(
        select(Reconciliation).where(
            Reconciliation.id == payload.reconciliation_id,
            Reconciliation.tenant_id == tenant.id,
        )
    )
    if not recon_result.scalar_one_or_none():
        raise NotFoundError("Reconciliation")

    compensation = Compensation(
        tenant_id=tenant.id,
        reconciliation_id=payload.reconciliation_id,
        name=payload.name,
        compensation_type=payload.compensation_type,
        threshold_amount=Decimal(str(payload.threshold_amount)) if payload.threshold_amount is not None else None,
        auto_apply=payload.auto_apply,
        rules=payload.rules,
    )
    db.add(compensation)
    await db.flush()
    await db.refresh(compensation)

    return {
        "id": str(compensation.id),
        "reconciliation_id": str(compensation.reconciliation_id),
        "name": compensation.name,
        "compensation_type": compensation.compensation_type,
        "threshold_amount": float(compensation.threshold_amount) if compensation.threshold_amount is not None else None,
        "auto_apply": compensation.auto_apply,
        "rules": compensation.rules,
        "created_at": compensation.created_at.isoformat() if compensation.created_at else None,
    }


# ---------------------------------------------------------------------------
# POST /compensations/{id}/apply — apply compensation to a run
# ---------------------------------------------------------------------------
@router.post("/compensations/{compensation_id}/apply")
async def apply_compensation(
    compensation_id: UUID,
    run_id: UUID = Query(..., description="The reconciliation run to apply compensation to"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Load the compensation rule
    comp_result = await db.execute(
        select(Compensation).where(
            Compensation.id == compensation_id,
            Compensation.tenant_id == tenant.id,
        )
    )
    compensation = comp_result.scalar_one_or_none()
    if not compensation:
        raise NotFoundError("Compensation")

    # Verify the run exists
    run_result = await db.execute(
        select(ReconRun).where(
            ReconRun.id == run_id,
            ReconRun.tenant_id == tenant.id,
        )
    )
    run = run_result.scalar_one_or_none()
    if not run:
        raise NotFoundError("Reconciliation run")

    if compensation.compensation_type == "write_off":
        affected = await _apply_write_off(db, run, tenant, compensation)
    elif compensation.compensation_type == "adjustment":
        affected = await _apply_adjustment(db, run, tenant, compensation)
    elif compensation.compensation_type == "reclassification":
        affected = await _apply_reclassification(db, run, tenant, compensation)
    else:
        raise BadRequestError(f"Unsupported compensation type: {compensation.compensation_type}")

    return {
        "compensation_id": str(compensation.id),
        "run_id": str(run_id),
        "compensation_type": compensation.compensation_type,
        "affected_count": affected,
        "status": "applied",
    }


# ---------------------------------------------------------------------------
# Compensation execution helpers
# ---------------------------------------------------------------------------

async def _apply_write_off(
    db: AsyncSession, run: ReconRun, tenant: Tenant, compensation: Compensation
) -> int:
    """Write off: find matched pairs where abs(difference) <= threshold_amount,
    update their match_status to 'compensated'.
    """
    threshold = compensation.threshold_amount or Decimal("0")

    pair_result = await db.execute(
        select(MatchPair).where(
            MatchPair.run_id == run.id,
            MatchPair.tenant_id == tenant.id,
        )
    )
    pairs = list(pair_result.scalars().all())

    affected = 0
    for pair in pairs:
        if pair.match_status in ("compensated", "swept_threshold", "swept_auto_match"):
            continue

        if pair.difference is not None and abs(pair.difference) <= threshold:
            pair.match_status = "compensated"
            pair.match_metadata = {
                **(pair.match_metadata or {}),
                "compensation_type": "write_off",
                "compensation_id": str(compensation.id),
                "written_off_amount": str(pair.difference),
            }
            affected += 1

    await db.flush()
    return affected


async def _apply_adjustment(
    db: AsyncSession, run: ReconRun, tenant: Tenant, compensation: Compensation
) -> int:
    """Adjustment: similar to write_off but creates adjustment metadata
    recording the original and adjusted amounts.
    """
    threshold = compensation.threshold_amount or Decimal("0")

    pair_result = await db.execute(
        select(MatchPair).where(
            MatchPair.run_id == run.id,
            MatchPair.tenant_id == tenant.id,
        )
    )
    pairs = list(pair_result.scalars().all())

    affected = 0
    for pair in pairs:
        if pair.match_status == "compensated":
            continue

        if pair.difference is not None and abs(pair.difference) <= threshold:
            pair.match_status = "compensated"
            pair.match_metadata = {
                **(pair.match_metadata or {}),
                "compensation_type": "adjustment",
                "compensation_id": str(compensation.id),
                "original_difference": str(pair.difference),
                "adjustment_amount": str(-pair.difference),
                "adjusted_difference": "0",
            }
            affected += 1

    await db.flush()
    return affected


async def _apply_reclassification(
    db: AsyncSession, run: ReconRun, tenant: Tenant, compensation: Compensation
) -> int:
    """Reclassification: update match metadata to flag items as reclassified."""
    rules = compensation.rules or {}
    from_category = rules.get("from_category")
    to_category = rules.get("to_category")

    pair_result = await db.execute(
        select(MatchPair).where(
            MatchPair.run_id == run.id,
            MatchPair.tenant_id == tenant.id,
        )
    )
    pairs = list(pair_result.scalars().all())

    affected = 0
    for pair in pairs:
        if pair.match_status == "compensated":
            continue

        # If we have category rules, check them; otherwise apply to all unresolved
        should_apply = True
        if from_category:
            current = (pair.match_metadata or {}).get("category")
            should_apply = current == from_category

        if should_apply and pair.difference is not None:
            threshold = compensation.threshold_amount or Decimal("0")
            if abs(pair.difference) <= threshold:
                pair.match_status = "compensated"
                pair.match_metadata = {
                    **(pair.match_metadata or {}),
                    "compensation_type": "reclassification",
                    "compensation_id": str(compensation.id),
                    "reclassified_from": from_category,
                    "reclassified_to": to_category,
                }
                affected += 1

    await db.flush()
    return affected


# ===========================================================================
# Consolidations
# ===========================================================================


class ConsolidationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    child_recon_ids: list[UUID] = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# GET /consolidations — list consolidations (tenant-scoped)
# ---------------------------------------------------------------------------
@router.get("/consolidations")
async def list_consolidations(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Consolidation)
        .where(Consolidation.tenant_id == tenant.id)
        .order_by(Consolidation.created_at.desc())
    )
    consolidations = result.scalars().all()

    return [
        {
            "id": str(c.id),
            "name": c.name,
            "description": c.description,
            "child_recon_ids": [str(rid) for rid in (c.child_recon_ids or [])],
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in consolidations
    ]


# ---------------------------------------------------------------------------
# POST /consolidations — create a consolidation
# ---------------------------------------------------------------------------
@router.post("/consolidations", status_code=status.HTTP_201_CREATED)
async def create_consolidation(
    payload: ConsolidationCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Verify all child reconciliations exist and belong to tenant
    for recon_id in payload.child_recon_ids:
        recon_result = await db.execute(
            select(Reconciliation).where(
                Reconciliation.id == recon_id,
                Reconciliation.tenant_id == tenant.id,
            )
        )
        if not recon_result.scalar_one_or_none():
            raise NotFoundError(f"Reconciliation {recon_id}")

    consolidation = Consolidation(
        tenant_id=tenant.id,
        name=payload.name,
        description=payload.description,
        child_recon_ids=payload.child_recon_ids,
    )
    db.add(consolidation)
    await db.flush()
    await db.refresh(consolidation)

    return {
        "id": str(consolidation.id),
        "name": consolidation.name,
        "description": consolidation.description,
        "child_recon_ids": [str(rid) for rid in (consolidation.child_recon_ids or [])],
        "created_at": consolidation.created_at.isoformat() if consolidation.created_at else None,
    }


# ---------------------------------------------------------------------------
# GET /consolidations/{id} — get consolidation with summary
# ---------------------------------------------------------------------------
@router.get("/consolidations/{consolidation_id}")
async def get_consolidation(
    consolidation_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Consolidation).where(
            Consolidation.id == consolidation_id,
            Consolidation.tenant_id == tenant.id,
        )
    )
    consolidation = result.scalar_one_or_none()
    if not consolidation:
        raise NotFoundError("Consolidation")

    # Build summary: for each child recon, find latest run stats
    child_summaries = []
    for recon_id in (consolidation.child_recon_ids or []):
        recon_result = await db.execute(
            select(Reconciliation).where(Reconciliation.id == recon_id)
        )
        recon = recon_result.scalar_one_or_none()
        if not recon:
            child_summaries.append({
                "reconciliation_id": str(recon_id),
                "name": None,
                "status": "not_found",
                "latest_run": None,
            })
            continue

        # Find the latest completed run
        run_result = await db.execute(
            select(ReconRun)
            .where(
                ReconRun.reconciliation_id == recon_id,
                ReconRun.tenant_id == tenant.id,
                ReconRun.status == "completed",
            )
            .order_by(ReconRun.completed_at.desc())
            .limit(1)
        )
        latest_run = run_result.scalar_one_or_none()

        child_summaries.append({
            "reconciliation_id": str(recon_id),
            "name": recon.name,
            "status": recon.status,
            "latest_run": {
                "id": str(latest_run.id),
                "status": latest_run.status,
                "matched_count": latest_run.matched_count,
                "unmatched_left": latest_run.unmatched_left,
                "unmatched_right": latest_run.unmatched_right,
                "match_rate": float(latest_run.match_rate) if latest_run.match_rate else None,
                "completed_at": latest_run.completed_at.isoformat() if latest_run.completed_at else None,
            } if latest_run else None,
        })

    return {
        "id": str(consolidation.id),
        "name": consolidation.name,
        "description": consolidation.description,
        "child_recon_ids": [str(rid) for rid in (consolidation.child_recon_ids or [])],
        "child_summaries": child_summaries,
        "created_at": consolidation.created_at.isoformat() if consolidation.created_at else None,
        "updated_at": consolidation.updated_at.isoformat() if consolidation.updated_at else None,
    }


# ---------------------------------------------------------------------------
# GET /consolidations/{id}/results — combined results from child recons
# ---------------------------------------------------------------------------
@router.get("/consolidations/{consolidation_id}/results")
async def get_consolidation_results(
    consolidation_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Consolidation).where(
            Consolidation.id == consolidation_id,
            Consolidation.tenant_id == tenant.id,
        )
    )
    consolidation = result.scalar_one_or_none()
    if not consolidation:
        raise NotFoundError("Consolidation")

    combined_results: list[dict] = []
    recon_summaries: list[dict] = []

    for recon_id in (consolidation.child_recon_ids or []):
        # Get the reconciliation name
        recon_result = await db.execute(
            select(Reconciliation).where(Reconciliation.id == recon_id)
        )
        recon = recon_result.scalar_one_or_none()
        recon_name = recon.name if recon else str(recon_id)

        # Find latest completed run
        run_result = await db.execute(
            select(ReconRun)
            .where(
                ReconRun.reconciliation_id == recon_id,
                ReconRun.tenant_id == tenant.id,
                ReconRun.status == "completed",
            )
            .order_by(ReconRun.completed_at.desc())
            .limit(1)
        )
        latest_run = run_result.scalar_one_or_none()
        if not latest_run:
            recon_summaries.append({
                "reconciliation_id": str(recon_id),
                "name": recon_name,
                "status": "no_completed_run",
                "result_count": 0,
            })
            continue

        # Fetch match pairs for this run
        pairs_result = await db.execute(
            select(MatchPair).where(
                MatchPair.run_id == latest_run.id,
                MatchPair.tenant_id == tenant.id,
            )
        )
        pairs = pairs_result.scalars().all()

        run_results = []
        for pair in pairs:
            run_results.append({
                "source_recon": recon_name,
                "source_recon_id": str(recon_id),
                "run_id": str(latest_run.id),
                "match_pair_id": str(pair.id),
                "match_status": pair.match_status,
                "confidence_score": float(pair.confidence_score) if pair.confidence_score else None,
                "left_amount": float(pair.left_amount) if pair.left_amount is not None else None,
                "right_amount": float(pair.right_amount) if pair.right_amount is not None else None,
                "difference": float(pair.difference) if pair.difference is not None else None,
            })

        # Fetch exceptions for this run
        exc_result = await db.execute(
            select(Exception_).where(
                Exception_.run_id == latest_run.id,
                Exception_.tenant_id == tenant.id,
            )
        )
        exceptions = exc_result.scalars().all()

        for exc in exceptions:
            run_results.append({
                "source_recon": recon_name,
                "source_recon_id": str(recon_id),
                "run_id": str(latest_run.id),
                "exception_id": str(exc.id),
                "match_status": f"exception_{exc.exception_type}",
                "side": exc.side,
                "severity": exc.severity,
                "status": exc.status,
                "left_amount": None,
                "right_amount": None,
                "difference": None,
            })

        recon_summaries.append({
            "reconciliation_id": str(recon_id),
            "name": recon_name,
            "status": "included",
            "run_id": str(latest_run.id),
            "result_count": len(run_results),
        })
        combined_results.extend(run_results)

    return {
        "consolidation_id": str(consolidation.id),
        "consolidation_name": consolidation.name,
        "recon_summaries": recon_summaries,
        "total_results": len(combined_results),
        "results": combined_results,
    }
