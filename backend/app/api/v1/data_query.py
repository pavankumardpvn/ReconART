"""Data Query API — programmatic access to query any data source's rows."""

import logging
import operator
from typing import Any
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

logger = logging.getLogger(__name__)

router = APIRouter()

# Supported filter operators mapped to comparison callables
_OPERATORS: dict[str, Any] = {
    "eq": operator.eq,
    "ne": operator.ne,
    "gt": operator.gt,
    "gte": operator.ge,
    "lt": operator.lt,
    "lte": operator.le,
    "contains": lambda a, b: b in str(a) if a is not None else False,
    "not_contains": lambda a, b: b not in str(a) if a is not None else True,
    "starts_with": lambda a, b: str(a).startswith(b) if a is not None else False,
    "ends_with": lambda a, b: str(a).endswith(b) if a is not None else False,
    "is_null": lambda a, _: a is None,
    "is_not_null": lambda a, _: a is not None,
}


class FilterSpec(BaseModel):
    """A single filter clause."""

    column: str
    operator: str = Field(
        ...,
        description=(
            "Comparison operator. One of: eq, ne, gt, gte, lt, lte, "
            "contains, not_contains, starts_with, ends_with, is_null, is_not_null"
        ),
    )
    value: Any = None


class DataQueryRequest(BaseModel):
    """Body for the data query endpoint."""

    data_source_id: UUID
    filters: list[FilterSpec] = Field(default_factory=list)
    limit: int = Field(default=100, ge=1, le=5000)
    offset: int = Field(default=0, ge=0)
    columns: list[str] = Field(
        default_factory=list,
        description="Optional list of columns to include. Empty = all columns.",
    )


class DataQueryResponse(BaseModel):
    """Response from the data query endpoint."""

    data_source_id: str
    total_matching: int
    offset: int
    limit: int
    rows: list[dict[str, Any]]


def _apply_filters(row_data: dict, filters: list[FilterSpec]) -> bool:
    """Return True if the row passes all filters."""
    for f in filters:
        value = row_data.get(f.column)
        op_func = _OPERATORS.get(f.operator)
        if op_func is None:
            continue  # unknown operator — skip gracefully
        try:
            if not op_func(value, f.value):
                return False
        except (TypeError, ValueError):
            # Type mismatch in comparison — row does not match
            return False
    return True


def _project_columns(row_data: dict, columns: list[str]) -> dict:
    """Return only the requested columns from the row. If columns is empty, return all."""
    if not columns:
        return row_data
    return {k: v for k, v in row_data.items() if k in columns}


# ---------------------------------------------------------------------------
# POST /query — query any resource's data
# ---------------------------------------------------------------------------
@router.post("/query", response_model=DataQueryResponse)
async def query_data(
    payload: DataQueryRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Query a data source's rows with optional filters, pagination, and column projection.

    This is the "External API" that clients can use to programmatically query their data.
    """
    # Verify the data source exists and belongs to this tenant
    ds_result = await db.execute(
        select(DataSource).where(
            DataSource.id == payload.data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    ds = ds_result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    # Validate filter operators
    for f in payload.filters:
        if f.operator not in _OPERATORS:
            raise BadRequestError(
                f"Unknown operator '{f.operator}'. "
                f"Supported: {', '.join(sorted(_OPERATORS.keys()))}"
            )

    # Fetch all rows for this data source (ordered by row_number)
    rows_result = await db.execute(
        select(DataSourceRow)
        .where(DataSourceRow.data_source_id == ds.id)
        .order_by(DataSourceRow.row_number)
    )
    all_rows = rows_result.scalars().all()

    # Apply filters in-memory (JSONB columns are not easily filterable in SQL generically)
    if payload.filters:
        filtered = [r for r in all_rows if _apply_filters(r.data, payload.filters)]
    else:
        filtered = list(all_rows)

    total_matching = len(filtered)

    # Paginate
    page = filtered[payload.offset : payload.offset + payload.limit]

    # Project columns
    projected = [_project_columns(r.data, payload.columns) for r in page]

    return DataQueryResponse(
        data_source_id=str(ds.id),
        total_matching=total_matching,
        offset=payload.offset,
        limit=payload.limit,
        rows=projected,
    )
