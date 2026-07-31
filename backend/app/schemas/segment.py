"""Segment schemas for filtering reconciliation data."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SegmentRuleCreate(BaseModel):
    """A single filter rule within a segment."""

    source_side: str = Field(..., description="'left' or 'right'")
    column_name: str
    operator: str = Field(
        ...,
        description="Filter operator: 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'starts_with'",
    )
    value: Any
    logic_group: int = Field(
        default=0,
        ge=0,
        description="Group index for OR-ing rules; rules in the same group are ANDed",
    )


class SegmentCreate(BaseModel):
    """Schema for creating a segment."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    reconciliation_id: UUID | None = None
    data_source_id: UUID | None = None
    rules: list[SegmentRuleCreate]


class SegmentResponse(BaseModel):
    """Full segment response returned to clients."""

    id: UUID
    name: str
    description: str | None = None
    reconciliation_id: UUID | None = None
    data_source_id: UUID | None = None
    rules: list = Field(default_factory=list)
    created_at: Any

    model_config = ConfigDict(from_attributes=True)
