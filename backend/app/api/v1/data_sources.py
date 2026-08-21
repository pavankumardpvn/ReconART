"""Data sources endpoints — upload, list, preview, and manage data sources."""

import logging
import operator as op
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.connectors.file_connector import FileConnector
from app.database import get_db
from app.dependencies import get_current_tenant, get_current_user
from app.exceptions import BadRequestError, NotFoundError
from app.models.data_source import DataSource, DataSourceColumn, DataSourceRow, SourceFile
from app.models.tenant import Tenant
from app.schemas.common import PaginatedResponse
from app.schemas.data_source import (
    DataSourceColumnResponse,
    DataSourceCreate,
    DataSourcePreviewResponse,
    DataSourceResponse,
    DataSourceUpdate,
)
from app.storage import get_storage
from app.utils.art_metadata import ART_SYSTEM_COLUMNS, inject_art_metadata
from app.utils.pagination import paginate

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 MB
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json", ".txt", ".dat"}


# ---------------------------------------------------------------------------
# GET / — list data sources (paginated, filterable)
# ---------------------------------------------------------------------------
@router.get("/", response_model=PaginatedResponse[DataSourceResponse])
async def list_data_sources(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    source_type: str | None = Query(None, description="Filter by source_type"),
    status_filter: str | None = Query(None, alias="status", description="Filter by status"),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    query = (
        select(DataSource)
        .where(DataSource.tenant_id == tenant.id, DataSource.deleted_at.is_(None))
        .order_by(DataSource.created_at.desc())
    )
    if source_type:
        query = query.where(DataSource.source_type == source_type)
    if status_filter:
        query = query.where(DataSource.status == status_filter)

    return await paginate(db, query, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# POST /create — create a source (container) without uploading a file
# ---------------------------------------------------------------------------
@router.post("/create", response_model=DataSourceResponse, status_code=status.HTTP_201_CREATED)
async def create_source(
    payload: DataSourceCreate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    data_source = DataSource(
        tenant_id=tenant.id,
        name=payload.name,
        description=payload.description,
        source_type=payload.source_type,
        status="active",
    )
    db.add(data_source)
    await db.flush()
    await db.refresh(data_source)
    return data_source


# ---------------------------------------------------------------------------
# POST /{id}/files — upload a file into an existing source
# ---------------------------------------------------------------------------
@router.post("/{data_source_id}/files", status_code=status.HTTP_201_CREATED)
async def upload_file_to_source(
    data_source_id: UUID,
    file: UploadFile,
    uploaded_by_name: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    # Verify source exists
    result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    if not file.filename:
        raise BadRequestError("A filename is required.")
    original_filename = file.filename
    suffix = "." + original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else ""
    if suffix not in ALLOWED_EXTENSIONS:
        raise BadRequestError(f"Unsupported file type '{suffix}'.")

    # Read in chunks for large files
    chunks = []
    total_size = 0
    while chunk := await file.read(1024 * 1024):  # 1MB chunks
        chunks.append(chunk)
        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE:
            raise BadRequestError(f"File exceeds the {MAX_FILE_SIZE // (1024 * 1024)}MB limit.")
    content = b"".join(chunks)

    # Save to storage first (always accept the file)
    storage = get_storage()
    relative_path = await storage.save(tenant.slug, original_filename, content)

    # Step 1: Try to parse the file
    error_message = None
    df = None
    schema_cols = []

    try:
        connector = FileConnector(content=content, filename=original_filename)
        df = await connector.fetch_data()
        schema_cols = await connector.get_schema()
    except Exception as e:
        error_message = str(e)

    # Step 2: Determine status after processing
    if df is None:
        file_status = "failed"
    else:
        # Structure check: if source already has columns, new file must match
        existing_cols = await db.execute(
            select(DataSourceColumn).where(DataSourceColumn.data_source_id == ds.id)
        )
        existing_col_names = {c.name for c in existing_cols.scalars().all()}
        new_col_names = {c["name"] for c in schema_cols}

        if existing_col_names and new_col_names != existing_col_names:
            missing = existing_col_names - new_col_names
            extra = new_col_names - existing_col_names
            parts = []
            if missing:
                parts.append(f"Missing columns: {', '.join(sorted(missing))}")
            if extra:
                parts.append(f"Unexpected columns: {', '.join(sorted(extra))}")
            file_status = "failed"
            error_message = f"Column structure mismatch. {'. '.join(parts)}. Expected: {', '.join(sorted(existing_col_names))}"
            df = None
        else:
            # Duplicate check by file size
            dup_result = await db.execute(
                select(SourceFile).where(
                    SourceFile.data_source_id == ds.id,
                    SourceFile.file_size_bytes == len(content),
                    SourceFile.status.in_(["success", "active"]),
                ).limit(1)
            )
            file_status = "duplicate" if dup_result.scalars().first() else "success"

    # Create SourceFile record
    source_file = SourceFile(
        data_source_id=ds.id,
        tenant_id=tenant.id,
        original_filename=original_filename,
        file_path=relative_path,
        file_size_bytes=len(content),
        row_count=len(df) if df is not None else 0,
        status=file_status,
        uploaded_by=uploaded_by_name or user.get("user_id"),
    )
    db.add(source_file)
    await db.flush()

    # Only insert rows for successful files (not duplicates)
    if file_status == "success" and df is not None:
        await _insert_file_data(db, ds, source_file, df, schema_cols, tenant)

    await db.flush()
    await db.refresh(source_file)

    return {
        "id": str(source_file.id),
        "data_source_id": str(ds.id),
        "original_filename": source_file.original_filename,
        "row_count": source_file.row_count,
        "file_size_bytes": source_file.file_size_bytes,
        "uploaded_at": source_file.uploaded_at.isoformat(),
        "status": source_file.status,
        "error_message": error_message,
    }


async def _insert_file_data(
    db: AsyncSession,
    ds: DataSource,
    source_file: SourceFile,
    df,
    schema_cols: list,
    tenant,
) -> None:
    """Merge columns and bulk-insert rows for a successfully parsed file."""
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

    file_id_str = str(source_file.id)
    file_name = source_file.original_filename
    records = df.where(df.notna(), None).to_dict(orient="records")
    bulk_rows = []
    for idx, row_data in enumerate(records):
        safe_row = {}
        for k, v in row_data.items():
            if v is None:
                safe_row[k] = None
            elif hasattr(v, "isoformat"):
                safe_row[k] = v.isoformat()
            else:
                safe_row[k] = v
        safe_row = inject_art_metadata(
            safe_row, idx + 1, file_id=file_id_str, file_name=file_name,
        )
        bulk_rows.append(DataSourceRow(
            data_source_id=ds.id,
            tenant_id=tenant.id,
            row_number=idx + 1,
            data=safe_row,
            source_file_id=source_file.id,
        ))
    db.add_all(bulk_rows)

    total_rows_result = await db.execute(
        select(func.count(DataSourceRow.id)).where(DataSourceRow.data_source_id == ds.id)
    )
    ds.row_count = total_rows_result.scalar_one() + len(df)
    ds.original_filename = source_file.original_filename
    ds.file_size_bytes = source_file.file_size_bytes


# ---------------------------------------------------------------------------
# POST /{id}/files/{file_id}/force-process — process a duplicate file
# ---------------------------------------------------------------------------
@router.post("/{data_source_id}/files/{file_id}/force-process")
async def force_process_file(
    data_source_id: UUID,
    file_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    ds = (await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )).scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    sf = (await db.execute(
        select(SourceFile).where(
            SourceFile.id == file_id,
            SourceFile.data_source_id == ds.id,
        )
    )).scalar_one_or_none()
    if not sf:
        raise NotFoundError("File")
    if sf.status not in ("duplicate", "failed"):
        raise BadRequestError("Only duplicate or failed files can be force-processed.")

    storage = get_storage()
    content = await storage.read(sf.file_path)

    try:
        connector = FileConnector(content=content, filename=sf.original_filename)
        df = await connector.fetch_data()
        schema_cols = await connector.get_schema()
    except Exception as e:
        sf.status = "failed"
        await db.flush()
        raise BadRequestError(f"File parsing failed: {e}")

    sf.status = "success"
    sf.row_count = len(df)
    await _insert_file_data(db, ds, sf, df, schema_cols, tenant)

    await db.flush()
    return {"status": "success", "row_count": sf.row_count}


# ---------------------------------------------------------------------------
# POST /{id}/files/{file_id}/move — move a file to another data source
# ---------------------------------------------------------------------------
class MoveFileRequest(BaseModel):
    target_source_id: str | None = None
    new_source_name: str | None = None


@router.post("/{data_source_id}/files/{file_id}/move")
async def move_file(
    data_source_id: UUID,
    file_id: UUID,
    payload: MoveFileRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    ds = (await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
        )
    )).scalar_one_or_none()
    if not ds:
        raise NotFoundError("Source data source")

    sf = (await db.execute(
        select(SourceFile).where(
            SourceFile.id == file_id,
            SourceFile.data_source_id == ds.id,
        )
    )).scalar_one_or_none()
    if not sf:
        raise NotFoundError("File")

    # Resolve target source
    if payload.new_source_name:
        target = DataSource(
            tenant_id=tenant.id,
            name=payload.new_source_name,
            source_type="file_upload",
            connector_type="file",
            status="active",
        )
        db.add(target)
        await db.flush()
    elif payload.target_source_id:
        target = (await db.execute(
            select(DataSource).where(
                DataSource.id == UUID(payload.target_source_id),
                DataSource.tenant_id == tenant.id,
                DataSource.deleted_at.is_(None),
            )
        )).scalar_one_or_none()
        if not target:
            raise NotFoundError("Target data source")
    else:
        raise BadRequestError("Provide either target_source_id or new_source_name.")

    # Move file to target source
    sf.data_source_id = target.id

    # Try to parse in new context
    storage = get_storage()
    content = await storage.read(sf.file_path)

    try:
        connector = FileConnector(content=content, filename=sf.original_filename)
        df = await connector.fetch_data()
        schema_cols = await connector.get_schema()
        sf.status = "success"
        sf.row_count = len(df)
        await _insert_file_data(db, ds=target, source_file=sf, df=df, schema_cols=schema_cols, tenant=tenant)
    except Exception:
        sf.status = "failed"
        sf.row_count = 0

    await db.flush()
    return {
        "status": sf.status,
        "target_source_id": str(target.id),
        "target_source_name": target.name,
    }


# ---------------------------------------------------------------------------
# GET /{id}/files — list files uploaded to a source
# ---------------------------------------------------------------------------
@router.get("/{data_source_id}/files")
async def list_source_files(
    data_source_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundError("Data source")

    files_result = await db.execute(
        select(SourceFile)
        .where(SourceFile.data_source_id == data_source_id, SourceFile.tenant_id == tenant.id)
        .order_by(SourceFile.uploaded_at.desc())
    )
    files = files_result.scalars().all()
    return [
        {
            "id": str(f.id),
            "original_filename": f.original_filename,
            "row_count": f.row_count,
            "file_size_bytes": f.file_size_bytes,
            "uploaded_at": f.uploaded_at.isoformat(),
            "status": f.status,
            "uploaded_by": f.uploaded_by,
        }
        for f in files
    ]


# ---------------------------------------------------------------------------
# POST /upload — upload CSV / Excel file (creates source + file in one step)
# ---------------------------------------------------------------------------
@router.post("/upload", response_model=DataSourceResponse, status_code=status.HTTP_201_CREATED)
async def upload_data_source(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    user: dict = Depends(get_current_user),
):
    # --- validate filename / extension ---
    if not file.filename:
        raise BadRequestError("A filename is required.")
    original_filename = file.filename
    suffix = "." + original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else ""
    if suffix not in ALLOWED_EXTENSIONS:
        raise BadRequestError(
            f"Unsupported file type '{suffix}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    # --- read in chunks and validate size ---
    chunks = []
    total_size = 0
    while chunk := await file.read(1024 * 1024):  # 1MB chunks
        chunks.append(chunk)
        total_size += len(chunk)
        if total_size > MAX_FILE_SIZE:
            raise BadRequestError(f"File exceeds the {MAX_FILE_SIZE // (1024 * 1024)}MB size limit.")
    content = b"".join(chunks)

    # --- persist to storage ---
    storage = get_storage()
    relative_path = await storage.save(tenant.slug, original_filename, content)

    # --- parse file from bytes ---
    connector = FileConnector(content=content, filename=original_filename)
    df = await connector.fetch_data()
    schema_cols = await connector.get_schema()

    # --- create DataSource record ---
    data_source = DataSource(
        tenant_id=tenant.id,
        name=original_filename.rsplit(".", 1)[0],
        source_type="file_upload",
        connector_type="file",
        status="active",
        file_path=relative_path,
        original_filename=original_filename,
        file_size_bytes=len(content),
        row_count=len(df),
    )
    db.add(data_source)
    await db.flush()

    # --- create DataSourceColumn records (ART system + user columns) ---
    for col_info in ART_SYSTEM_COLUMNS + schema_cols:
        db.add(DataSourceColumn(
            data_source_id=data_source.id,
            tenant_id=tenant.id,
            name=col_info["name"],
            display_name=col_info.get("display_name", col_info["name"]),
            data_type=col_info.get("data_type", "string"),
            ordinal_position=col_info.get("ordinal_position", 0),
        ))

    # --- store rows as JSONB with ART metadata (bulk insert) ---
    records = df.where(df.notna(), None).to_dict(orient="records")
    bulk_rows = []
    for idx, row_data in enumerate(records):
        safe_row: dict = {}
        for k, v in row_data.items():
            if v is None:
                safe_row[k] = None
            elif hasattr(v, "isoformat"):
                safe_row[k] = v.isoformat()
            else:
                safe_row[k] = v
        safe_row = inject_art_metadata(
            safe_row, idx + 1, file_name=original_filename,
        )
        bulk_rows.append(DataSourceRow(
            data_source_id=data_source.id,
            tenant_id=tenant.id,
            row_number=idx + 1,
            data=safe_row,
        ))
    db.add_all(bulk_rows)

    await db.flush()
    await db.refresh(data_source)
    return data_source


# ---------------------------------------------------------------------------
# GET /{id} — get data source details
# ---------------------------------------------------------------------------
@router.get("/{data_source_id}", response_model=DataSourceResponse)
async def get_data_source(
    data_source_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")
    return ds


# ---------------------------------------------------------------------------
# PATCH /{id} — update name / description
# ---------------------------------------------------------------------------
@router.patch("/{data_source_id}", response_model=DataSourceResponse)
async def update_data_source(
    data_source_id: UUID,
    payload: DataSourceUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(ds, key, value)

    await db.flush()
    await db.refresh(ds)
    return ds


# ---------------------------------------------------------------------------
# DELETE /{id} — soft delete
# ---------------------------------------------------------------------------
@router.delete("/{data_source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_data_source(
    data_source_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    from datetime import datetime, timezone

    result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    ds.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return None


# ---------------------------------------------------------------------------
# GET /{id}/preview — first 100 rows
# ---------------------------------------------------------------------------
@router.get("/{data_source_id}/preview")
async def preview_data_source(
    data_source_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    col_result = await db.execute(
        select(DataSourceColumn)
        .where(DataSourceColumn.data_source_id == data_source_id)
        .order_by(DataSourceColumn.ordinal_position)
    )
    columns = list(col_result.scalars().all())

    total_result = await db.execute(
        select(func.count(DataSourceRow.id))
        .where(DataSourceRow.data_source_id == data_source_id)
    )
    total_rows = total_result.scalar_one()

    import math
    offset = (page - 1) * page_size
    row_result = await db.execute(
        select(DataSourceRow)
        .where(DataSourceRow.data_source_id == data_source_id)
        .order_by(DataSourceRow.row_number)
        .offset(offset)
        .limit(page_size)
    )
    rows = [r.data for r in row_result.scalars().all()]

    return {
        "columns": [{"name": c.name, "data_type": c.data_type, "ordinal_position": c.ordinal_position} for c in columns],
        "rows": rows,
        "total_rows": total_rows,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total_rows / page_size) if total_rows > 0 else 0,
    }


# ---------------------------------------------------------------------------
# GET /{id}/columns — list columns
# ---------------------------------------------------------------------------
@router.get("/{data_source_id}/columns", response_model=list[DataSourceColumnResponse])
async def list_columns(
    data_source_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    # Verify data source exists and belongs to tenant
    ds_result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    if not ds_result.scalar_one_or_none():
        raise NotFoundError("Data source")

    result = await db.execute(
        select(DataSourceColumn)
        .where(DataSourceColumn.data_source_id == data_source_id)
        .order_by(DataSourceColumn.ordinal_position)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# POST /{id}/filter — create a filtered copy of a data source
# ---------------------------------------------------------------------------

class FilterRule(BaseModel):
    column: str
    operator: str = Field(
        ...,
        description="Filter operator: eq, neq, gt, gte, lt, lte, in, not_in, contains, starts_with",
    )
    value: Any


class FilterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    filters: list[FilterRule] = Field(..., min_length=1)


# Supported filter operators mapped to comparison functions
_FILTER_OPS: dict[str, Any] = {
    "eq": op.eq,
    "neq": op.ne,
    "gt": op.gt,
    "gte": op.ge,
    "lt": op.lt,
    "lte": op.le,
}


def _row_matches_filters(row_data: dict, filters: list[FilterRule]) -> bool:
    """Return True if row_data satisfies ALL filter rules (AND logic)."""
    for f in filters:
        cell_value = row_data.get(f.column)
        expected = f.value

        if f.operator in _FILTER_OPS:
            try:
                if not _FILTER_OPS[f.operator](cell_value, expected):
                    return False
            except (TypeError, ValueError):
                return False
        elif f.operator == "in":
            if not isinstance(expected, list):
                expected = [expected]
            if cell_value not in expected:
                return False
        elif f.operator == "not_in":
            if not isinstance(expected, list):
                expected = [expected]
            if cell_value in expected:
                return False
        elif f.operator == "contains":
            if cell_value is None or str(expected) not in str(cell_value):
                return False
        elif f.operator == "starts_with":
            if cell_value is None or not str(cell_value).startswith(str(expected)):
                return False
        else:
            # Unknown operator — treat as non-match
            return False
    return True


@router.post("/{data_source_id}/filter", status_code=status.HTTP_201_CREATED)
async def filter_data_source(
    data_source_id: UUID,
    payload: FilterRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Apply filters to a data source and save matching rows as a new DataSource."""
    # Verify source exists
    result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    source_ds = result.scalar_one_or_none()
    if not source_ds:
        raise NotFoundError("Data source")

    # Fetch all rows
    row_result = await db.execute(
        select(DataSourceRow)
        .where(DataSourceRow.data_source_id == data_source_id)
        .order_by(DataSourceRow.row_number)
    )
    all_rows = row_result.scalars().all()

    # Apply filters
    filtered_rows: list[dict] = []
    for row in all_rows:
        row_data = row.data or {}
        if _row_matches_filters(row_data, payload.filters):
            filtered_rows.append(row_data)

    # Create new DataSource
    filtered_ds = DataSource(
        tenant_id=tenant.id,
        name=payload.name,
        source_type="filtered",
        status="active",
        row_count=len(filtered_rows),
    )
    db.add(filtered_ds)
    await db.flush()

    # Copy columns from the original source
    col_result = await db.execute(
        select(DataSourceColumn)
        .where(DataSourceColumn.data_source_id == data_source_id)
        .order_by(DataSourceColumn.ordinal_position)
    )
    for col in col_result.scalars().all():
        db.add(DataSourceColumn(
            data_source_id=filtered_ds.id,
            tenant_id=tenant.id,
            name=col.name,
            display_name=col.display_name,
            data_type=col.data_type,
            ordinal_position=col.ordinal_position,
        ))

    # Create rows with ART metadata
    for idx, row_data in enumerate(filtered_rows):
        row_data = inject_art_metadata(row_data, idx + 1)
        db.add(DataSourceRow(
            data_source_id=filtered_ds.id,
            tenant_id=tenant.id,
            row_number=idx + 1,
            data=row_data,
        ))

    await db.flush()
    await db.refresh(filtered_ds)

    return {
        "id": str(filtered_ds.id),
        "name": filtered_ds.name,
        "source_type": filtered_ds.source_type,
        "row_count": len(filtered_rows),
        "original_row_count": len(all_rows),
        "source_data_source_id": str(data_source_id),
    }


# ---------------------------------------------------------------------------
# GET /{id}/quality — data quality scores
# ---------------------------------------------------------------------------
@router.get("/{data_source_id}/quality")
async def data_quality(
    data_source_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
    _user: dict = Depends(get_current_user),
):
    """Return data quality scores (completeness, uniqueness, consistency)."""
    result = await db.execute(
        select(DataSource).where(
            DataSource.id == data_source_id,
            DataSource.tenant_id == tenant.id,
            DataSource.deleted_at.is_(None),
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise NotFoundError("Data source")

    # Fetch columns
    col_result = await db.execute(
        select(DataSourceColumn)
        .where(DataSourceColumn.data_source_id == data_source_id)
        .order_by(DataSourceColumn.ordinal_position)
    )
    columns = [
        {"name": c.name, "data_type": c.data_type or "string"}
        for c in col_result.scalars().all()
    ]

    # Fetch all rows
    row_result = await db.execute(
        select(DataSourceRow)
        .where(DataSourceRow.data_source_id == data_source_id)
        .order_by(DataSourceRow.row_number)
    )
    rows = [r.data for r in row_result.scalars().all()]

    from app.services.data_quality import score_data_quality

    return score_data_quality(rows, columns)
