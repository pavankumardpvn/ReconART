"""Unions API — combine rows from multiple data sources with column mapping."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import NotFoundError
from app.models.data_source import DataSource, DataSourceColumn, DataSourceRow
from app.models.tenant import Tenant
from app.models.transform import Union, UnionMember

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class UnionMemberCreate(BaseModel):
    data_source_id: UUID
    column_mapping: dict = Field(default_factory=dict)


class UnionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    members: list[UnionMemberCreate] = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# GET / — list unions (tenant-scoped)
# ---------------------------------------------------------------------------
@router.get("/")
async def list_unions(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Union)
        .where(Union.tenant_id == tenant.id)
        .options(selectinload(Union.members))
        .order_by(Union.created_at.desc())
    )
    unions = result.scalars().all()

    return [
        {
            "id": str(u.id),
            "name": u.name,
            "description": u.description,
            "member_count": len(u.members),
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "updated_at": u.updated_at.isoformat() if u.updated_at else None,
        }
        for u in unions
    ]


# ---------------------------------------------------------------------------
# POST / — create a union with members
# ---------------------------------------------------------------------------
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_union(
    payload: UnionCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Verify all member data sources belong to this tenant
    for idx, member in enumerate(payload.members):
        ds_result = await db.execute(
            select(DataSource).where(
                DataSource.id == member.data_source_id,
                DataSource.tenant_id == tenant.id,
            )
        )
        if not ds_result.scalar_one_or_none():
            raise NotFoundError(f"Data source for member {idx}")

    union = Union(
        tenant_id=tenant.id,
        name=payload.name,
        description=payload.description,
    )
    db.add(union)
    await db.flush()

    for idx, member in enumerate(payload.members):
        union_member = UnionMember(
            union_id=union.id,
            data_source_id=member.data_source_id,
            column_mapping=member.column_mapping or None,
            ordinal=idx,
        )
        db.add(union_member)

    await db.flush()
    await db.refresh(union)

    # Re-load with members
    result = await db.execute(
        select(Union)
        .where(Union.id == union.id)
        .options(selectinload(Union.members))
    )
    union = result.scalar_one()

    return {
        "id": str(union.id),
        "name": union.name,
        "description": union.description,
        "members": [
            {
                "id": str(m.id),
                "data_source_id": str(m.data_source_id),
                "column_mapping": m.column_mapping,
                "ordinal": m.ordinal,
            }
            for m in sorted(union.members, key=lambda m: m.ordinal or 0)
        ],
        "created_at": union.created_at.isoformat() if union.created_at else None,
    }


# ---------------------------------------------------------------------------
# GET /{id} — get union with members
# ---------------------------------------------------------------------------
@router.get("/{union_id}")
async def get_union(
    union_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Union)
        .where(Union.id == union_id, Union.tenant_id == tenant.id)
        .options(selectinload(Union.members))
    )
    union = result.scalar_one_or_none()
    if not union:
        raise NotFoundError("Union")

    return {
        "id": str(union.id),
        "name": union.name,
        "description": union.description,
        "members": [
            {
                "id": str(m.id),
                "data_source_id": str(m.data_source_id),
                "column_mapping": m.column_mapping,
                "ordinal": m.ordinal,
            }
            for m in sorted(union.members, key=lambda m: m.ordinal or 0)
        ],
        "created_at": union.created_at.isoformat() if union.created_at else None,
        "updated_at": union.updated_at.isoformat() if union.updated_at else None,
    }


# ---------------------------------------------------------------------------
# DELETE /{id} — delete union (cascades to members)
# ---------------------------------------------------------------------------
@router.delete("/{union_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_union(
    union_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Union).where(Union.id == union_id, Union.tenant_id == tenant.id)
    )
    union = result.scalar_one_or_none()
    if not union:
        raise NotFoundError("Union")

    await db.delete(union)
    await db.flush()
    return None


# ---------------------------------------------------------------------------
# GET /{id}/preview — preview the union result (first 100 rows)
# ---------------------------------------------------------------------------
@router.get("/{union_id}/preview")
async def preview_union(
    union_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Union)
        .where(Union.id == union_id, Union.tenant_id == tenant.id)
        .options(selectinload(Union.members))
    )
    union = result.scalar_one_or_none()
    if not union:
        raise NotFoundError("Union")

    combined_rows: list[dict] = []
    members_sorted = sorted(union.members, key=lambda m: m.ordinal or 0)

    for member in members_sorted:
        # Fetch rows from this member's data source
        row_result = await db.execute(
            select(DataSourceRow)
            .where(DataSourceRow.data_source_id == member.data_source_id)
            .order_by(DataSourceRow.row_number)
            .limit(100)
        )
        rows = row_result.scalars().all()

        mapping = member.column_mapping or {}

        for row in rows:
            row_data = row.data or {}

            # Apply column mapping: rename columns according to the mapping
            if mapping:
                mapped_data = {}
                for original_col, target_col in mapping.items():
                    if original_col in row_data:
                        mapped_data[target_col] = row_data[original_col]
                # Include unmapped columns as-is
                for col, val in row_data.items():
                    if col not in mapping:
                        mapped_data[col] = val
                row_data = mapped_data

            combined_rows.append({
                "_source_data_source_id": str(member.data_source_id),
                "_source_row_number": row.row_number,
                **row_data,
            })

            if len(combined_rows) >= 100:
                break

        if len(combined_rows) >= 100:
            break

    return {
        "union_id": str(union.id),
        "union_name": union.name,
        "total_rows": len(combined_rows),
        "rows": combined_rows[:100],
    }


# ---------------------------------------------------------------------------
# POST /{id}/materialize — compute union and save as a new DataSource
# ---------------------------------------------------------------------------
@router.post("/{union_id}/materialize", status_code=status.HTTP_201_CREATED)
async def materialize_union(
    union_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Compute the union and save results as a new DataSource."""
    # 1. Load the union and its members
    result = await db.execute(
        select(Union)
        .where(Union.id == union_id, Union.tenant_id == tenant.id)
        .options(selectinload(Union.members))
    )
    union = result.scalar_one_or_none()
    if not union:
        raise NotFoundError("Union")

    # 2-4. Fetch rows from each member, apply column mapping, combine
    combined_rows: list[dict] = []
    all_columns: set[str] = set()
    members_sorted = sorted(union.members, key=lambda m: m.ordinal or 0)

    for member in members_sorted:
        row_result = await db.execute(
            select(DataSourceRow)
            .where(DataSourceRow.data_source_id == member.data_source_id)
            .order_by(DataSourceRow.row_number)
        )
        rows = row_result.scalars().all()
        mapping = member.column_mapping or {}

        for row in rows:
            row_data = row.data or {}

            # Apply column mapping: rename columns according to the mapping
            if mapping:
                mapped_data = {}
                for original_col, target_col in mapping.items():
                    if original_col in row_data:
                        mapped_data[target_col] = row_data[original_col]
                # Include unmapped columns as-is
                for col, val in row_data.items():
                    if col not in mapping:
                        mapped_data[col] = val
                row_data = mapped_data

            all_columns.update(row_data.keys())
            combined_rows.append(row_data)

    # 5. Create a new DataSource with source_type = "union"
    materialized_ds = DataSource(
        tenant_id=tenant.id,
        name=f"{union.name} (Materialized)",
        source_type="union",
        status="active",
        row_count=len(combined_rows),
    )
    db.add(materialized_ds)
    await db.flush()

    # 6. Create DataSourceColumn records from the combined column set
    for idx, col_name in enumerate(sorted(all_columns)):
        db.add(DataSourceColumn(
            data_source_id=materialized_ds.id,
            tenant_id=tenant.id,
            name=col_name,
            display_name=col_name,
            data_type="string",
            ordinal_position=idx,
        ))

    # 7. Create DataSourceRow records for each combined row
    for idx, row_data in enumerate(combined_rows):
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
        "row_count": len(combined_rows),
        "column_count": len(all_columns),
        "source_union_id": str(union.id),
    }
