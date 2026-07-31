"""Interactive SQL Notebook — execute queries, manage saved queries, browse schema."""

import logging
import re
import time
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.notebook import SavedNotebookQuery
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    sql: str = Field(..., min_length=1, max_length=10000)
    limit: int = Field(default=100, ge=1, le=5000)


class QueryResult(BaseModel):
    columns: list[str]
    rows: list[list]
    row_count: int
    execution_time_ms: float


class SavedQueryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    sql: str = Field(..., min_length=1, max_length=10000)
    description: str | None = None


class SavedQueryUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    sql: str | None = Field(default=None, max_length=10000)
    description: str | None = None


class SavedQueryResponse(BaseModel):
    id: str
    name: str
    sql: str
    description: str | None = None
    created_by: str | None = None
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


class TableColumn(BaseModel):
    name: str
    data_type: str
    description: str | None = None


class TableInfo(BaseModel):
    name: str
    description: str
    columns: list[TableColumn]


# ---------------------------------------------------------------------------
# Queryable tables — schema definitions for the sidebar
# ---------------------------------------------------------------------------

QUERYABLE_TABLES: list[TableInfo] = [
    TableInfo(
        name="data_sources",
        description="Uploaded or connected data sources",
        columns=[
            TableColumn(name="id", data_type="uuid"),
            TableColumn(name="name", data_type="text"),
            TableColumn(name="source_type", data_type="text"),
            TableColumn(name="status", data_type="text"),
            TableColumn(name="row_count", data_type="integer"),
            TableColumn(name="original_filename", data_type="text"),
            TableColumn(name="file_size_bytes", data_type="bigint"),
            TableColumn(name="created_at", data_type="timestamp"),
            TableColumn(name="updated_at", data_type="timestamp"),
        ],
    ),
    TableInfo(
        name="data_source_rows",
        description="Individual rows stored from data sources",
        columns=[
            TableColumn(name="id", data_type="uuid"),
            TableColumn(name="data_source_id", data_type="uuid"),
            TableColumn(name="row_number", data_type="integer"),
            TableColumn(name="data", data_type="jsonb"),
            TableColumn(name="created_at", data_type="timestamp"),
        ],
    ),
    TableInfo(
        name="reconciliations",
        description="Reconciliation configurations",
        columns=[
            TableColumn(name="id", data_type="uuid"),
            TableColumn(name="name", data_type="text"),
            TableColumn(name="description", data_type="text"),
            TableColumn(name="recon_type", data_type="text"),
            TableColumn(name="status", data_type="text"),
            TableColumn(name="left_source_id", data_type="uuid"),
            TableColumn(name="right_source_id", data_type="uuid"),
            TableColumn(name="tolerance_amount", data_type="numeric"),
            TableColumn(name="tolerance_percent", data_type="numeric"),
            TableColumn(name="created_at", data_type="timestamp"),
            TableColumn(name="updated_at", data_type="timestamp"),
        ],
    ),
    TableInfo(
        name="recon_runs",
        description="Execution runs of reconciliations",
        columns=[
            TableColumn(name="id", data_type="uuid"),
            TableColumn(name="reconciliation_id", data_type="uuid"),
            TableColumn(name="status", data_type="text"),
            TableColumn(name="triggered_by", data_type="text"),
            TableColumn(name="started_at", data_type="timestamp"),
            TableColumn(name="completed_at", data_type="timestamp"),
            TableColumn(name="left_row_count", data_type="integer"),
            TableColumn(name="right_row_count", data_type="integer"),
            TableColumn(name="matched_count", data_type="integer"),
            TableColumn(name="unmatched_left", data_type="integer"),
            TableColumn(name="unmatched_right", data_type="integer"),
            TableColumn(name="exception_count", data_type="integer"),
            TableColumn(name="match_rate", data_type="numeric"),
            TableColumn(name="created_at", data_type="timestamp"),
        ],
    ),
    TableInfo(
        name="match_pairs",
        description="Matched record pairs from reconciliation runs",
        columns=[
            TableColumn(name="id", data_type="uuid"),
            TableColumn(name="run_id", data_type="uuid"),
            TableColumn(name="match_status", data_type="text"),
            TableColumn(name="confidence_score", data_type="numeric"),
            TableColumn(name="left_amount", data_type="numeric"),
            TableColumn(name="right_amount", data_type="numeric"),
            TableColumn(name="difference", data_type="numeric"),
            TableColumn(name="created_at", data_type="timestamp"),
        ],
    ),
    TableInfo(
        name="exceptions",
        description="Reconciliation exceptions and unmatched items",
        columns=[
            TableColumn(name="id", data_type="uuid"),
            TableColumn(name="run_id", data_type="uuid"),
            TableColumn(name="side", data_type="text"),
            TableColumn(name="exception_type", data_type="text"),
            TableColumn(name="severity", data_type="text"),
            TableColumn(name="status", data_type="text"),
            TableColumn(name="assigned_to", data_type="text"),
            TableColumn(name="resolution_note", data_type="text"),
            TableColumn(name="resolved_at", data_type="timestamp"),
            TableColumn(name="created_at", data_type="timestamp"),
            TableColumn(name="updated_at", data_type="timestamp"),
        ],
    ),
]

ALLOWED_TABLE_NAMES = {t.name for t in QUERYABLE_TABLES}

# System tables that users CANNOT modify (only SELECT)
PROTECTED_TABLES = {
    "tenants", "tenant_members", "api_keys",
    "alembic_version", "audit_logs",
}


# ---------------------------------------------------------------------------
# SQL validation
# ---------------------------------------------------------------------------

_DANGEROUS_KEYWORDS = ["GRANT", "REVOKE", "TRUNCATE"]

_DANGEROUS_PATTERN = re.compile(
    r"\b(" + "|".join(_DANGEROUS_KEYWORDS) + r")\b",
    re.IGNORECASE,
)


def _validate_sql(sql: str) -> None:
    """Validate SQL — allow SELECT, CREATE TABLE, INSERT, UPDATE, DELETE.

    Block only truly dangerous operations (GRANT, REVOKE, TRUNCATE).
    Protect system tables from modification.
    """
    normalized = sql.strip().upper()

    # Block dangerous admin operations
    match = _DANGEROUS_PATTERN.search(sql)
    if match:
        raise BadRequestError(f"{match.group(1).upper()} statements are not allowed")

    # Block DROP DATABASE
    if "DROP DATABASE" in normalized or "DROP SCHEMA" in normalized:
        raise BadRequestError("DROP DATABASE/SCHEMA is not allowed")

    # For write operations, check they don't target protected system tables
    write_ops = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER"]
    for op in write_ops:
        if normalized.startswith(op) or f" {op} " in f" {normalized} ":
            for protected in PROTECTED_TABLES:
                if protected.upper() in normalized:
                    raise BadRequestError(f"Cannot modify system table '{protected}'")

    # Allow: SELECT, CREATE TABLE, INSERT, UPDATE, DELETE, DROP TABLE (custom), ALTER TABLE (custom)
    allowed_starts = ["SELECT", "CREATE", "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "WITH"]
    if not any(normalized.startswith(prefix) for prefix in allowed_starts):
        raise BadRequestError(f"Unsupported SQL statement. Allowed: {', '.join(allowed_starts)}")


def _inject_tenant_filter(sql: str, tenant_id: str) -> str:
    """Wrap the user query in a CTE that filters each allowed table by tenant_id.

    This approach creates CTEs for every allowed table name, each filtered
    to the current tenant, then runs the user's original SQL on top of those
    CTEs.  This way the user's SQL can reference table names naturally and
    still only see their own data.
    """
    cte_parts: list[str] = []
    for table_name in ALLOWED_TABLE_NAMES:
        cte_parts.append(
            f"{table_name} AS (SELECT * FROM public.{table_name} WHERE tenant_id = '{tenant_id}')"
        )
    cte_clause = "WITH " + ",\n     ".join(cte_parts)
    return f"{cte_clause}\n{sql}"


# ---------------------------------------------------------------------------
# POST /execute — run a SQL query
# ---------------------------------------------------------------------------

@router.post("/execute", response_model=QueryResult)
async def execute_notebook_query(
    payload: QueryRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    _validate_sql(payload.sql)

    sql = payload.sql.strip().rstrip(";")
    is_select = sql.strip().upper().startswith("SELECT") or sql.strip().upper().startswith("WITH")

    # For SELECT queries: add LIMIT and tenant filter
    if is_select:
        if "LIMIT" not in sql.upper():
            sql = f"{sql} LIMIT {payload.limit}"
        safe_sql = _inject_tenant_filter(sql, str(tenant.id))
    else:
        # For write queries (CREATE, INSERT, UPDATE, DELETE): run as-is
        safe_sql = sql

    start = time.monotonic()
    try:
        result = await db.execute(text(safe_sql))
        if not is_select:
            await db.commit()
    except Exception as exc:
        await db.rollback()
        raise BadRequestError(f"Query error: {exc}") from exc
    elapsed = (time.monotonic() - start) * 1000

    # For write operations, return affected row count
    if not is_select:
        affected = result.rowcount if result.rowcount >= 0 else 0
        message = sql.strip().split()[0].upper()
        return QueryResult(
            columns=["result"],
            rows=[[f"{message} executed successfully. {affected} row(s) affected."]],
            row_count=1,
            execution_time_ms=round(elapsed, 2),
        )

    columns = list(result.keys()) if result.returns_rows else []
    rows = [list(row) for row in result.fetchall()] if result.returns_rows else []

    def _serialize(val):
        if isinstance(val, UUID):
            return str(val)
        if isinstance(val, (datetime, date)):
            return val.isoformat()
        if isinstance(val, Decimal):
            return float(val)
        return val

    rows = [[_serialize(cell) for cell in row] for row in rows]

    return QueryResult(
        columns=columns,
        rows=rows,
        row_count=len(rows),
        execution_time_ms=round(elapsed, 2),
    )


# ---------------------------------------------------------------------------
# GET /tables — list available tables and their columns
# ---------------------------------------------------------------------------

@router.get("/tables", response_model=list[TableInfo])
async def list_tables(
    _user: dict = Depends(get_current_user),
):
    return QUERYABLE_TABLES


# ---------------------------------------------------------------------------
# Saved queries CRUD
# ---------------------------------------------------------------------------

async def _get_saved_query_or_404(
    query_id: UUID,
    tenant: Tenant,
    db: AsyncSession,
) -> SavedNotebookQuery:
    result = await db.execute(
        select(SavedNotebookQuery).where(
            SavedNotebookQuery.id == query_id,
            SavedNotebookQuery.tenant_id == tenant.id,
        )
    )
    saved = result.scalar_one_or_none()
    if not saved:
        raise NotFoundError("Saved query")
    return saved


@router.post("/saved", response_model=SavedQueryResponse, status_code=status.HTTP_201_CREATED)
async def create_saved_query(
    payload: SavedQueryCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    saved = SavedNotebookQuery(
        tenant_id=tenant.id,
        name=payload.name,
        sql=payload.sql,
        description=payload.description,
        created_by=user.get("user_id"),
    )
    db.add(saved)
    await db.flush()
    await db.refresh(saved)
    return saved


@router.get("/saved", response_model=list[SavedQueryResponse])
async def list_saved_queries(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedNotebookQuery)
        .where(SavedNotebookQuery.tenant_id == tenant.id)
        .order_by(SavedNotebookQuery.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/saved/{query_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_query(
    query_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    saved = await _get_saved_query_or_404(query_id, tenant, db)
    await db.delete(saved)
    await db.flush()
    return None
