"""Calculated columns endpoints — create, list, preview computed columns."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.data_source import DataSource, DataSourceRow
from app.models.tenant import Tenant
from app.models.transform import CalculatedColumn
from app.services.expression_engine import ExpressionError, evaluate_expression, validate_expression

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class CalculatedColumnCreate(BaseModel):
    data_source_id: UUID
    name: str = Field(..., min_length=1, max_length=255)
    expression: str = Field(..., min_length=1)
    result_type: str | None = Field(None, max_length=50)


class CalculatedColumnResponse(BaseModel):
    id: UUID
    data_source_id: UUID
    name: str
    expression: str
    result_type: str | None = None
    tenant_id: UUID
    created_at: str | None = None
    updated_at: str | None = None

    class Config:
        from_attributes = True


class PreviewRow(BaseModel):
    row_number: int
    original_data: dict
    computed_value: object = None
    error: str | None = None


class PreviewResponse(BaseModel):
    column_name: str
    expression: str
    results: list[PreviewRow]


# ---------------------------------------------------------------------------
# GET / — list calculated columns for a data source
# ---------------------------------------------------------------------------
@router.get("/")
async def list_calculated_columns(
    data_source_id: UUID = Query(..., description="Filter by data source ID"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Verify the data source belongs to the tenant
    ds_result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
        )
    )
    if not ds_result.scalar_one_or_none():
        raise NotFoundError("Data source")

    result = await db.execute(
        select(CalculatedColumn).where(
            CalculatedColumn.data_source_id == data_source_id,
            CalculatedColumn.tenant_id == tenant.id,
        ).order_by(CalculatedColumn.created_at.desc())
    )
    columns = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "data_source_id": str(c.data_source_id),
            "name": c.name,
            "expression": c.expression,
            "result_type": c.result_type,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in columns
    ]


# ---------------------------------------------------------------------------
# POST / — create a calculated column
# ---------------------------------------------------------------------------
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_calculated_column(
    payload: CalculatedColumnCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Verify the data source exists and belongs to the tenant
    ds_result = await db.execute(
        select(DataSource).where(
            DataSource.id == payload.data_source_id,
            DataSource.tenant_id == tenant.id,
        )
    )
    if not ds_result.scalar_one_or_none():
        raise NotFoundError("Data source")

    # Validate the expression syntax before saving
    try:
        validate_expression(payload.expression)
    except ExpressionError as exc:
        raise BadRequestError(f"Invalid expression: {exc}")

    calc_col = CalculatedColumn(
        tenant_id=tenant.id,
        data_source_id=payload.data_source_id,
        name=payload.name,
        expression=payload.expression,
        result_type=payload.result_type,
    )
    db.add(calc_col)
    await db.flush()
    await db.refresh(calc_col)

    return {
        "id": str(calc_col.id),
        "data_source_id": str(calc_col.data_source_id),
        "name": calc_col.name,
        "expression": calc_col.expression,
        "result_type": calc_col.result_type,
        "created_at": calc_col.created_at.isoformat() if calc_col.created_at else None,
    }


# ---------------------------------------------------------------------------
# GET /{id} — get a calculated column
# ---------------------------------------------------------------------------
@router.get("/{column_id}")
async def get_calculated_column(
    column_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(CalculatedColumn).where(
            CalculatedColumn.id == column_id,
            CalculatedColumn.tenant_id == tenant.id,
        )
    )
    calc_col = result.scalar_one_or_none()
    if not calc_col:
        raise NotFoundError("Calculated column")

    return {
        "id": str(calc_col.id),
        "data_source_id": str(calc_col.data_source_id),
        "name": calc_col.name,
        "expression": calc_col.expression,
        "result_type": calc_col.result_type,
        "created_at": calc_col.created_at.isoformat() if calc_col.created_at else None,
        "updated_at": calc_col.updated_at.isoformat() if calc_col.updated_at else None,
    }


# ---------------------------------------------------------------------------
# DELETE /{id} — delete a calculated column
# ---------------------------------------------------------------------------
@router.delete("/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calculated_column(
    column_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(CalculatedColumn).where(
            CalculatedColumn.id == column_id,
            CalculatedColumn.tenant_id == tenant.id,
        )
    )
    calc_col = result.scalar_one_or_none()
    if not calc_col:
        raise NotFoundError("Calculated column")

    await db.delete(calc_col)
    await db.flush()
    return None


# ---------------------------------------------------------------------------
# POST /{id}/preview — preview computed values on first 10 rows
# ---------------------------------------------------------------------------
@router.post("/{column_id}/preview")
async def preview_calculated_column(
    column_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Load the calculated column
    result = await db.execute(
        select(CalculatedColumn).where(
            CalculatedColumn.id == column_id,
            CalculatedColumn.tenant_id == tenant.id,
        )
    )
    calc_col = result.scalar_one_or_none()
    if not calc_col:
        raise NotFoundError("Calculated column")

    # Fetch the first 10 rows from the data source
    row_result = await db.execute(
        select(DataSourceRow)
        .where(DataSourceRow.data_source_id == calc_col.data_source_id)
        .order_by(DataSourceRow.row_number)
        .limit(10)
    )
    rows = row_result.scalars().all()

    # Evaluate the expression against each row
    preview_results: list[dict] = []
    for row in rows:
        row_data = row.data or {}
        try:
            computed = evaluate_expression(calc_col.expression, row_data)
            preview_results.append({
                "row_number": row.row_number,
                "original_data": row_data,
                "computed_value": computed,
                "error": None,
            })
        except ExpressionError as exc:
            preview_results.append({
                "row_number": row.row_number,
                "original_data": row_data,
                "computed_value": None,
                "error": str(exc),
            })

    return {
        "column_name": calc_col.name,
        "expression": calc_col.expression,
        "results": preview_results,
    }
