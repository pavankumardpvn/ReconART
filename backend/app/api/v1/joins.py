"""Joins API — combine rows from two data sources using join conditions."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.data_source import DataSource, DataSourceRow
from app.models.tenant import Tenant
from app.models.transform import Join

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_JOIN_TYPES = {"inner", "left", "right", "full"}
VALID_OPERATORS = {"eq", "neq", "gt", "gte", "lt", "lte"}


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class JoinCondition(BaseModel):
    left_col: str
    operator: str = "eq"
    right_col: str


class JoinCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    left_source_id: UUID
    right_source_id: UUID
    join_type: str = Field(default="inner")
    join_conditions: list[JoinCondition] = Field(..., min_length=1)
    output_columns: list[str] | None = None


# ---------------------------------------------------------------------------
# GET / — list joins (tenant-scoped)
# ---------------------------------------------------------------------------
@router.get("/")
async def list_joins(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Join)
        .where(Join.tenant_id == tenant.id)
        .order_by(Join.created_at.desc())
    )
    joins = result.scalars().all()

    return [
        {
            "id": str(j.id),
            "name": j.name,
            "left_source_id": str(j.left_source_id),
            "right_source_id": str(j.right_source_id),
            "join_type": j.join_type,
            "join_conditions": j.join_conditions,
            "output_columns": j.output_columns,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "updated_at": j.updated_at.isoformat() if j.updated_at else None,
        }
        for j in joins
    ]


# ---------------------------------------------------------------------------
# POST / — create a join
# ---------------------------------------------------------------------------
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_join(
    payload: JoinCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    if payload.join_type not in VALID_JOIN_TYPES:
        raise BadRequestError(
            f"Invalid join_type '{payload.join_type}'. "
            f"Must be one of: {', '.join(sorted(VALID_JOIN_TYPES))}"
        )

    for cond in payload.join_conditions:
        if cond.operator not in VALID_OPERATORS:
            raise BadRequestError(
                f"Invalid operator '{cond.operator}'. "
                f"Must be one of: {', '.join(sorted(VALID_OPERATORS))}"
            )

    # Verify both data sources belong to tenant
    for label, source_id in [("Left", payload.left_source_id), ("Right", payload.right_source_id)]:
        ds_result = await db.execute(
            select(DataSource).where(
                DataSource.id == source_id,
                DataSource.tenant_id == tenant.id,
            )
        )
        if not ds_result.scalar_one_or_none():
            raise NotFoundError(f"{label} data source")

    join = Join(
        tenant_id=tenant.id,
        name=payload.name,
        left_source_id=payload.left_source_id,
        right_source_id=payload.right_source_id,
        join_type=payload.join_type,
        join_conditions=[c.model_dump() for c in payload.join_conditions],
        output_columns=payload.output_columns,
    )
    db.add(join)
    await db.flush()
    await db.refresh(join)

    return {
        "id": str(join.id),
        "name": join.name,
        "left_source_id": str(join.left_source_id),
        "right_source_id": str(join.right_source_id),
        "join_type": join.join_type,
        "join_conditions": join.join_conditions,
        "output_columns": join.output_columns,
        "created_at": join.created_at.isoformat() if join.created_at else None,
    }


# ---------------------------------------------------------------------------
# GET /{id} — get join
# ---------------------------------------------------------------------------
@router.get("/{join_id}")
async def get_join(
    join_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Join).where(Join.id == join_id, Join.tenant_id == tenant.id)
    )
    join = result.scalar_one_or_none()
    if not join:
        raise NotFoundError("Join")

    return {
        "id": str(join.id),
        "name": join.name,
        "left_source_id": str(join.left_source_id),
        "right_source_id": str(join.right_source_id),
        "join_type": join.join_type,
        "join_conditions": join.join_conditions,
        "output_columns": join.output_columns,
        "created_at": join.created_at.isoformat() if join.created_at else None,
        "updated_at": join.updated_at.isoformat() if join.updated_at else None,
    }


# ---------------------------------------------------------------------------
# DELETE /{id} — delete join
# ---------------------------------------------------------------------------
@router.delete("/{join_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_join(
    join_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Join).where(Join.id == join_id, Join.tenant_id == tenant.id)
    )
    join = result.scalar_one_or_none()
    if not join:
        raise NotFoundError("Join")

    await db.delete(join)
    await db.flush()
    return None


# ---------------------------------------------------------------------------
# GET /{id}/preview — preview the join result (first 100 rows)
# ---------------------------------------------------------------------------
@router.get("/{join_id}/preview")
async def preview_join(
    join_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Join).where(Join.id == join_id, Join.tenant_id == tenant.id)
    )
    join = result.scalar_one_or_none()
    if not join:
        raise NotFoundError("Join")

    # Fetch rows from both sources (limit to prevent memory issues)
    left_result = await db.execute(
        select(DataSourceRow)
        .where(DataSourceRow.data_source_id == join.left_source_id)
        .order_by(DataSourceRow.row_number)
        .limit(1000)
    )
    left_rows = left_result.scalars().all()

    right_result = await db.execute(
        select(DataSourceRow)
        .where(DataSourceRow.data_source_id == join.right_source_id)
        .order_by(DataSourceRow.row_number)
        .limit(1000)
    )
    right_rows = right_result.scalars().all()

    conditions = join.join_conditions or []

    # Perform the join in Python
    joined_rows = _perform_join(
        left_rows=left_rows,
        right_rows=right_rows,
        join_type=join.join_type,
        conditions=conditions,
        output_columns=join.output_columns,
    )

    return {
        "join_id": str(join.id),
        "join_name": join.name,
        "join_type": join.join_type,
        "left_row_count": len(left_rows),
        "right_row_count": len(right_rows),
        "total_rows": len(joined_rows),
        "rows": joined_rows[:100],
    }


# ---------------------------------------------------------------------------
# Join execution helpers
# ---------------------------------------------------------------------------

def _compare(left_val, right_val, operator: str) -> bool:
    """Compare two values using the specified operator."""
    if left_val is None or right_val is None:
        return False

    # Attempt numeric comparison if both look numeric
    try:
        lv = float(left_val) if not isinstance(left_val, (int, float)) else left_val
        rv = float(right_val) if not isinstance(right_val, (int, float)) else right_val
    except (ValueError, TypeError):
        lv, rv = left_val, right_val

    if operator == "eq":
        return str(lv) == str(rv) if not isinstance(lv, (int, float)) else lv == rv
    elif operator == "neq":
        return str(lv) != str(rv) if not isinstance(lv, (int, float)) else lv != rv
    elif operator == "gt":
        return lv > rv
    elif operator == "gte":
        return lv >= rv
    elif operator == "lt":
        return lv < rv
    elif operator == "lte":
        return lv <= rv
    return False


def _matches(left_data: dict, right_data: dict, conditions: list[dict]) -> bool:
    """Check if a left row and right row satisfy all join conditions."""
    for cond in conditions:
        left_col = cond.get("left_col", "")
        right_col = cond.get("right_col", "")
        operator = cond.get("operator", "eq")
        if not _compare(left_data.get(left_col), right_data.get(right_col), operator):
            return False
    return True


def _merge_row(
    left_data: dict | None,
    right_data: dict | None,
    output_columns: list[str] | None,
) -> dict:
    """Merge left and right row data into a single output dict."""
    merged: dict = {}

    if left_data:
        for k, v in left_data.items():
            merged[f"left_{k}"] = v
    if right_data:
        for k, v in right_data.items():
            merged[f"right_{k}"] = v

    # If output_columns is specified, filter to only those columns
    if output_columns:
        filtered = {}
        for col in output_columns:
            if col in merged:
                filtered[col] = merged[col]
        return filtered

    return merged


def _perform_join(
    left_rows: list,
    right_rows: list,
    join_type: str,
    conditions: list[dict],
    output_columns: list[str] | None,
) -> list[dict]:
    """Execute a nested-loop join in Python for small datasets."""
    results: list[dict] = []
    right_matched: set[int] = set()

    for left_row in left_rows:
        left_data = left_row.data or {}
        found_match = False

        for right_idx, right_row in enumerate(right_rows):
            right_data = right_row.data or {}

            if _matches(left_data, right_data, conditions):
                found_match = True
                right_matched.add(right_idx)
                results.append(_merge_row(left_data, right_data, output_columns))

                if len(results) >= 100:
                    return results

        # Left join or full join: include unmatched left rows
        if not found_match and join_type in ("left", "full"):
            results.append(_merge_row(left_data, None, output_columns))
            if len(results) >= 100:
                return results

    # Right join or full join: include unmatched right rows
    if join_type in ("right", "full"):
        for right_idx, right_row in enumerate(right_rows):
            if right_idx not in right_matched:
                right_data = right_row.data or {}
                results.append(_merge_row(None, right_data, output_columns))
                if len(results) >= 100:
                    return results

    return results
