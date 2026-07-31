"""Export schemas for generating downloadable reports."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ExportCreate(BaseModel):
    """Schema for requesting a new export."""

    run_id: UUID
    export_type: Literal["csv", "excel"] = Field(
        ..., description="Output format"
    )
    export_scope: Literal["matched", "unmatched", "exceptions", "full"] = Field(
        ..., description="Which rows to include in the export"
    )


class ExportResponse(BaseModel):
    """Full export response returned to clients."""

    id: UUID
    run_id: UUID
    export_type: str
    export_scope: str
    status: str
    file_size_bytes: int | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
