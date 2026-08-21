"""Connector routes — database integration (live) and API connector stubs."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.data_source import DataSource, DataSourceColumn, DataSourceRow
from app.utils.art_metadata import ART_SYSTEM_COLUMNS, inject_art_metadata
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter()

PHASE_2_EXPECTED = "Q1 2025"

AVAILABLE_CONNECTORS = [
    {"type": "plaid", "name": "Plaid", "category": "banking", "status": "coming_soon"},
    {"type": "stripe", "name": "Stripe", "category": "payments", "status": "coming_soon"},
    {"type": "paypal", "name": "PayPal", "category": "payments", "status": "coming_soon"},
    {"type": "razorpay", "name": "Razorpay", "category": "payments", "status": "coming_soon"},
    {"type": "database", "name": "Database", "category": "database", "status": "active"},
]


def _stub_response(feature: str) -> JSONResponse:
    """Return a 501 Not Implemented response for a Phase 2 feature."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={
            "detail": f"Feature coming soon: {feature}",
            "status": "phase_2",
            "expected": PHASE_2_EXPECTED,
        },
    )


# ---------------------------------------------------------------------------
# Pydantic models for database connector
# ---------------------------------------------------------------------------
class DatabaseConnectionTest(BaseModel):
    """Body for testing a database connection."""

    db_type: str = Field(..., description="postgresql or mysql")
    host: str
    port: int
    database: str
    username: str
    password: str


class DatabaseImport(BaseModel):
    """Body for importing data from a database query."""

    data_source_id: UUID
    db_type: str = Field(..., description="postgresql or mysql")
    host: str
    port: int
    database: str
    username: str
    password: str
    query: str = Field(..., description="SQL query to execute")


# ---------------------------------------------------------------------------
# POST /database/test — test a database connection
# ---------------------------------------------------------------------------
@router.post("/database/test")
async def test_database_connection(
    payload: DatabaseConnectionTest,
    _user: dict = Depends(get_current_user),
    _tenant: Tenant = Depends(get_current_tenant),
):
    """Test connectivity to a PostgreSQL or MySQL database."""
    from app.connectors.db_connector import DatabaseConnector

    connector = DatabaseConnector(
        {
            "db_type": payload.db_type,
            "host": payload.host,
            "port": payload.port,
            "database": payload.database,
            "username": payload.username,
            "password": payload.password,
        }
    )

    try:
        await connector.connect()
    except (ValueError, ConnectionError) as exc:
        return {"success": False, "error": str(exc)}

    return {"success": True, "message": "Connection successful"}


# ---------------------------------------------------------------------------
# POST /database/import — import data from a database query
# ---------------------------------------------------------------------------
@router.post("/database/import", status_code=status.HTTP_201_CREATED)
async def import_from_database(
    payload: DatabaseImport,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    """Run a SQL query against an external database and import the rows into a data source."""
    from app.connectors.db_connector import DatabaseConnector

    # Verify the data source exists and belongs to this tenant
    result = await db.execute(
        select(DataSource).where(
            DataSource.id == payload.data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    connector = DatabaseConnector(
        {
            "db_type": payload.db_type,
            "host": payload.host,
            "port": payload.port,
            "database": payload.database,
            "username": payload.username,
            "password": payload.password,
            "query": payload.query,
        }
    )

    try:
        df = await connector.fetch_data()
        schema_cols = await connector.get_schema()
    except (ValueError, ConnectionError, RuntimeError) as exc:
        raise BadRequestError(f"Database import failed: {exc}")

    # Merge columns (add new ones only)
    existing_cols = await db.execute(
        select(DataSourceColumn).where(DataSourceColumn.data_source_id == ds.id)
    )
    existing_names = {c.name for c in existing_cols.scalars().all()}

    all_cols = ART_SYSTEM_COLUMNS + schema_cols
    for col_info in all_cols:
        if col_info["name"] not in existing_names:
            db.add(DataSourceColumn(
                data_source_id=ds.id,
                tenant_id=tenant.id,
                name=col_info["name"],
                display_name=col_info.get("display_name", col_info["name"]),
                data_type=col_info.get("data_type", "string"),
                ordinal_position=col_info.get("ordinal_position", 0),
            ))
            existing_names.add(col_info["name"])

    # Store rows as JSONB with ART metadata
    records = df.where(df.notna(), None).to_dict(orient="records")
    for idx, row_data in enumerate(records):
        safe_row: dict = {}
        for k, v in row_data.items():
            if v is None:
                safe_row[k] = None
            elif hasattr(v, "isoformat"):
                safe_row[k] = v.isoformat()
            else:
                safe_row[k] = v
        safe_row = inject_art_metadata(safe_row, idx + 1)
        db.add(DataSourceRow(
            data_source_id=ds.id,
            tenant_id=tenant.id,
            row_number=idx + 1,
            data=safe_row,
        ))

    # Update source totals
    total_rows_result = await db.execute(
        select(func.count(DataSourceRow.id)).where(
            DataSourceRow.data_source_id == ds.id
        )
    )
    ds.row_count = total_rows_result.scalar_one() + len(df)
    ds.source_type = "database"
    ds.connector_type = payload.db_type

    await db.flush()
    await db.refresh(ds)

    return {
        "data_source_id": str(ds.id),
        "rows_imported": len(df),
        "columns": [c["name"] for c in schema_cols],
        "total_rows": ds.row_count,
    }


# ---------------------------------------------------------------------------
# API connector stubs (Phase 2)
# ---------------------------------------------------------------------------
@router.post("/plaid", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def connect_plaid(
    _user: dict = Depends(get_current_user),
    _tenant=Depends(get_current_tenant),
):
    """Connect a Plaid bank account -- Phase 2 stub."""
    return _stub_response("Plaid bank integration coming in Phase 2")


@router.post("/stripe", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def connect_stripe(
    _user: dict = Depends(get_current_user),
    _tenant=Depends(get_current_tenant),
):
    """Connect Stripe -- Phase 2 stub."""
    return _stub_response("Stripe integration coming in Phase 2")


@router.post("/paypal", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def connect_paypal(
    _user: dict = Depends(get_current_user),
    _tenant=Depends(get_current_tenant),
):
    """Connect PayPal -- Phase 2 stub."""
    return _stub_response("PayPal integration coming in Phase 2")


@router.post("/razorpay", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def connect_razorpay(
    _user: dict = Depends(get_current_user),
    _tenant=Depends(get_current_tenant),
):
    """Connect Razorpay -- Phase 2 stub."""
    return _stub_response("Razorpay integration coming in Phase 2")


# ---------------------------------------------------------------------------
# GET /available — list connector types
# ---------------------------------------------------------------------------
@router.get("/available")
async def list_available_connectors(
    _user: dict = Depends(get_current_user),
    _tenant=Depends(get_current_tenant),
):
    """List available connector types and their readiness status."""
    return {"connectors": AVAILABLE_CONNECTORS}


# ---------------------------------------------------------------------------
# POST /databricks/test — test Databricks connection
# ---------------------------------------------------------------------------
class DatabricksConfig(BaseModel):
    server_hostname: str
    http_path: str
    access_token: str
    catalog: str | None = None
    schema_name: str | None = None
    query: str = "SELECT 1"


@router.post("/databricks/test")
async def test_databricks(
    payload: DatabricksConfig,
    _user: dict = Depends(get_current_user),
    _tenant=Depends(get_current_tenant),
):
    try:
        from app.connectors.databricks_connector import DatabricksConnector
        connector = DatabricksConnector({
            "server_hostname": payload.server_hostname,
            "http_path": payload.http_path,
            "access_token": payload.access_token,
            "catalog": payload.catalog,
            "schema": payload.schema_name,
            "query": "SELECT 1",
        })
        await connector.connect()
        df = await connector.fetch_data()
        return {"status": "success", "message": f"Connected successfully. Test query returned {len(df)} row(s)."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ---------------------------------------------------------------------------
# POST /databricks/import — import data from Databricks
# ---------------------------------------------------------------------------
class DatabricksImportRequest(BaseModel):
    data_source_id: UUID
    server_hostname: str
    http_path: str
    access_token: str
    catalog: str | None = None
    schema_name: str | None = None
    query: str


@router.post("/databricks/import", status_code=status.HTTP_201_CREATED)
async def import_from_databricks(
    payload: DatabricksImportRequest,
    db: AsyncSession = Depends(get_db),
    tenant=Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    ds_result = await db.execute(
        select(DataSource).where(DataSource.id == payload.data_source_id, DataSource.tenant_id == tenant.id)
    )
    ds = ds_result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    try:
        from app.connectors.databricks_connector import DatabricksConnector
        connector = DatabricksConnector({
            "server_hostname": payload.server_hostname,
            "http_path": payload.http_path,
            "access_token": payload.access_token,
            "catalog": payload.catalog,
            "schema": payload.schema_name,
            "query": payload.query,
        })
        df = await connector.fetch_data()
        schema_cols = await connector.get_schema()
    except Exception as e:
        raise BadRequestError(f"Databricks query failed: {e}")

    existing_cols = await db.execute(
        select(DataSourceColumn).where(DataSourceColumn.data_source_id == ds.id)
    )
    existing_names = {c.name for c in existing_cols.scalars().all()}

    all_cols = ART_SYSTEM_COLUMNS + schema_cols
    for col_info in all_cols:
        if col_info["name"] not in existing_names:
            db.add(DataSourceColumn(
                data_source_id=ds.id, tenant_id=tenant.id,
                name=col_info["name"],
                display_name=col_info.get("display_name", col_info["name"]),
                data_type=col_info.get("data_type", "string"),
                ordinal_position=col_info.get("ordinal_position", 0),
            ))
            existing_names.add(col_info["name"])

    records = df.where(df.notna(), None).to_dict(orient="records")
    for idx, row_data in enumerate(records):
        safe = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row_data.items()}
        safe = inject_art_metadata(safe, idx + 1)
        db.add(DataSourceRow(
            data_source_id=ds.id, tenant_id=tenant.id,
            row_number=idx + 1, data=safe,
        ))

    row_count_result = await db.execute(
        select(func.count(DataSourceRow.id)).where(DataSourceRow.data_source_id == ds.id)
    )
    ds.row_count = row_count_result.scalar_one() + len(df)
    ds.connector_type = "databricks"
    ds.status = "active"

    await db.flush()

    return {
        "status": "success",
        "data_source_id": str(ds.id),
        "imported_rows": len(df),
        "total_rows": ds.row_count,
        "columns": len(schema_cols),
    }
