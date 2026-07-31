"""Groups API — aggregate rows from a data source by specified columns."""

import logging
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.data_source import DataSource, DataSourceColumn, DataSourceRow
from app.models.tenant import Tenant
from app.models.transform import Group

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_AGG_FUNCTIONS = {"sum", "count", "avg", "min", "max"}


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class AggregationDef(BaseModel):
    column: str
    function: str
    alias: str


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    source_id: UUID
    group_by_columns: list[str] = Field(..., min_length=1)
    aggregations: list[AggregationDef] = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# GET / — list groups (tenant-scoped)
# ---------------------------------------------------------------------------
@router.get("/")
async def list_groups(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Group)
        .where(Group.tenant_id == tenant.id)
        .order_by(Group.created_at.desc())
    )
    groups = result.scalars().all()

    return [
        {
            "id": str(g.id),
            "name": g.name,
            "source_id": str(g.source_id),
            "group_by_columns": g.group_by_columns,
            "aggregations": g.aggregations,
            "created_at": g.created_at.isoformat() if g.created_at else None,
            "updated_at": g.updated_at.isoformat() if g.updated_at else None,
        }
        for g in groups
    ]


# ---------------------------------------------------------------------------
# POST / — create a group
# ---------------------------------------------------------------------------
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_group(
    payload: GroupCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Validate aggregation functions
    for agg in payload.aggregations:
        if agg.function not in VALID_AGG_FUNCTIONS:
            raise BadRequestError(
                f"Invalid aggregation function '{agg.function}'. "
                f"Must be one of: {', '.join(sorted(VALID_AGG_FUNCTIONS))}"
            )

    # Verify the data source belongs to tenant
    ds_result = await db.execute(
        select(DataSource).where(
            DataSource.id == payload.source_id,
            DataSource.tenant_id == tenant.id,
        )
    )
    if not ds_result.scalar_one_or_none():
        raise NotFoundError("Data source")

    group = Group(
        tenant_id=tenant.id,
        name=payload.name,
        source_id=payload.source_id,
        group_by_columns=payload.group_by_columns,
        aggregations=[a.model_dump() for a in payload.aggregations],
    )
    db.add(group)
    await db.flush()
    await db.refresh(group)

    return {
        "id": str(group.id),
        "name": group.name,
        "source_id": str(group.source_id),
        "group_by_columns": group.group_by_columns,
        "aggregations": group.aggregations,
        "created_at": group.created_at.isoformat() if group.created_at else None,
    }


# ---------------------------------------------------------------------------
# GET /{id} — get group
# ---------------------------------------------------------------------------
@router.get("/{group_id}")
async def get_group(
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.tenant_id == tenant.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundError("Group")

    return {
        "id": str(group.id),
        "name": group.name,
        "source_id": str(group.source_id),
        "group_by_columns": group.group_by_columns,
        "aggregations": group.aggregations,
        "created_at": group.created_at.isoformat() if group.created_at else None,
        "updated_at": group.updated_at.isoformat() if group.updated_at else None,
    }


# ---------------------------------------------------------------------------
# DELETE /{id} — delete group
# ---------------------------------------------------------------------------
@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.tenant_id == tenant.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundError("Group")

    await db.delete(group)
    await db.flush()
    return None


# ---------------------------------------------------------------------------
# GET /{id}/preview — preview grouped results
# ---------------------------------------------------------------------------
@router.get("/{group_id}/preview")
async def preview_group(
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.tenant_id == tenant.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundError("Group")

    # Fetch all rows from the source
    row_result = await db.execute(
        select(DataSourceRow)
        .where(DataSourceRow.data_source_id == group.source_id)
        .order_by(DataSourceRow.row_number)
    )
    rows = row_result.scalars().all()

    group_by_cols: list[str] = group.group_by_columns or []
    agg_defs: list[dict] = group.aggregations or []

    grouped_results = _compute_groups(rows, group_by_cols, agg_defs)

    return {
        "group_id": str(group.id),
        "group_name": group.name,
        "source_row_count": len(rows),
        "group_count": len(grouped_results),
        "rows": grouped_results[:100],
    }


# ---------------------------------------------------------------------------
# POST /{id}/materialize — compute group and save as a new DataSource
# ---------------------------------------------------------------------------
@router.post("/{group_id}/materialize", status_code=status.HTTP_201_CREATED)
async def materialize_group(
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Compute the group aggregation and save results as a new DataSource."""
    # 1. Load the group config
    result = await db.execute(
        select(Group).where(Group.id == group_id, Group.tenant_id == tenant.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundError("Group")

    # 2. Fetch all rows from the source
    row_result = await db.execute(
        select(DataSourceRow)
        .where(DataSourceRow.data_source_id == group.source_id)
        .order_by(DataSourceRow.row_number)
    )
    rows = row_result.scalars().all()

    # 3-4. Group by columns and apply aggregation functions
    group_by_cols: list[str] = group.group_by_columns or []
    agg_defs: list[dict] = group.aggregations or []
    grouped_results = _compute_groups(rows, group_by_cols, agg_defs)

    # 5. Create a new DataSource with source_type = "group"
    materialized_ds = DataSource(
        tenant_id=tenant.id,
        name=f"{group.name} (Materialized)",
        source_type="group",
        status="active",
        row_count=len(grouped_results),
    )
    db.add(materialized_ds)
    await db.flush()

    # 6. Create DataSourceColumn records from group_by_columns + aggregation aliases
    col_names: list[str] = list(group_by_cols)
    for agg in agg_defs:
        alias = agg.get("alias", f"{agg.get('function', 'agg')}_{agg.get('column', '')}")
        col_names.append(alias)

    for idx, col_name in enumerate(col_names):
        # Infer data type: group-by columns keep "string", aggregation columns are "number"
        data_type = "number" if col_name not in group_by_cols else "string"
        db.add(DataSourceColumn(
            data_source_id=materialized_ds.id,
            tenant_id=tenant.id,
            name=col_name,
            display_name=col_name,
            data_type=data_type,
            ordinal_position=idx,
        ))

    # 7. Create DataSourceRow records for each grouped row
    for idx, row_data in enumerate(grouped_results):
        db.add(DataSourceRow(
            data_source_id=materialized_ds.id,
            tenant_id=tenant.id,
            row_number=idx + 1,
            data=row_data,
        ))

    await db.flush()
    await db.refresh(materialized_ds)

    return {
        "id": str(materialized_ds.id),
        "name": materialized_ds.name,
        "source_type": materialized_ds.source_type,
        "row_count": len(grouped_results),
        "column_count": len(col_names),
        "source_group_id": str(group.id),
    }


# ---------------------------------------------------------------------------
# Grouping/aggregation helpers
# ---------------------------------------------------------------------------

def _to_decimal(val) -> Decimal | None:
    """Attempt to parse a value as Decimal."""
    if val is None:
        return None
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _compute_groups(
    rows: list,
    group_by_cols: list[str],
    agg_defs: list[dict],
) -> list[dict]:
    """Group rows and apply aggregation functions."""
    # Build buckets: group key -> list of row data dicts
    buckets: dict[tuple, list[dict]] = defaultdict(list)

    for row in rows:
        data = row.data or {}
        key = tuple(str(data.get(col, "")) for col in group_by_cols)
        buckets[key].append(data)

    results: list[dict] = []
    for key, bucket_rows in buckets.items():
        row_out: dict = {}

        # Include group-by column values
        for idx, col in enumerate(group_by_cols):
            row_out[col] = key[idx] if idx < len(key) else None

        # Apply each aggregation
        for agg in agg_defs:
            col_name = agg.get("column", "")
            func = agg.get("function", "count")
            alias = agg.get("alias", f"{func}_{col_name}")

            if func == "count":
                row_out[alias] = len(bucket_rows)
            else:
                values = [
                    _to_decimal(r.get(col_name))
                    for r in bucket_rows
                    if _to_decimal(r.get(col_name)) is not None
                ]

                if not values:
                    row_out[alias] = None
                elif func == "sum":
                    row_out[alias] = float(sum(values))
                elif func == "avg":
                    row_out[alias] = float(sum(values) / len(values))
                elif func == "min":
                    row_out[alias] = float(min(values))
                elif func == "max":
                    row_out[alias] = float(max(values))
                else:
                    row_out[alias] = None

        results.append(row_out)

    return results
