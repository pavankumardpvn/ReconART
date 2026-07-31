"""Data source schemas for file uploads and external connections."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DataSourceCreate(BaseModel):
    """Schema for creating a new data source."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    source_type: str = Field(
        ..., description="Type of data source: 'file_upload', 'database', 'api'"
    )


class DataSourceUpdate(BaseModel):
    """Schema for updating an existing data source."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class DataSourceResponse(BaseModel):
    """Full data source response returned to clients."""

    id: UUID
    name: str
    description: str | None = None
    source_type: str
    connector_type: str | None = None
    status: str
    row_count: int | None = None
    original_filename: str | None = None
    file_size_bytes: int | None = None
    last_synced_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DataSourceColumnResponse(BaseModel):
    """Column metadata for a data source."""

    id: UUID
    name: str
    display_name: str | None = None
    data_type: str
    ordinal_position: int
    is_primary_key: bool = False
    sample_values: list[Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class DataSourcePreviewResponse(BaseModel):
    """Preview of data source rows and schema."""

    columns: list[DataSourceColumnResponse]
    rows: list[dict[str, Any]]
    total_rows: int

    model_config = ConfigDict(from_attributes=True)
