"""Reconciliation, run, match, and exception schemas."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ── Rule / condition creation ────────────────────────────────────────

class ReconRuleConditionCreate(BaseModel):
    """A single comparison condition within a reconciliation rule."""

    left_column: str
    right_column: str
    comparison: str = Field(
        ...,
        description="Comparison operator: 'exact', 'numeric_tolerance', 'date_tolerance', 'fuzzy'",
    )
    tolerance_value: float | None = None
    fuzzy_threshold: float | None = Field(
        default=None, ge=0.0, le=1.0, description="0-1 similarity threshold for fuzzy matching"
    )
    is_key: bool = Field(default=False, description="Whether this condition is part of the join key")


class ReconRuleCreate(BaseModel):
    """A matching rule composed of one or more conditions."""

    name: str | None = None
    match_type: str = Field(
        ..., description="'one_to_one', 'one_to_many', 'many_to_many'"
    )
    priority: int = Field(default=1, ge=1, description="Execution order; lower runs first")
    conditions: list[ReconRuleConditionCreate]


# ── Reconciliation CRUD ──────────────────────────────────────────────

class ReconciliationCreate(BaseModel):
    """Schema for creating a new reconciliation."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    recon_type: str = Field(
        ..., description="'one_to_one', 'one_to_many', 'many_to_many'"
    )
    left_source_id: UUID | None = None
    right_source_id: UUID | None = None
    left_source_label: str | None = None
    right_source_label: str | None = None
    tolerance_amount: float = Field(default=0, ge=0)
    tolerance_percent: float = Field(default=0, ge=0, le=100)
    rules: list[ReconRuleCreate] = Field(default_factory=list)


class ReconciliationUpdate(BaseModel):
    """Schema for updating an existing reconciliation."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: str | None = None
    tolerance_amount: float | None = Field(default=None, ge=0)
    tolerance_percent: float | None = Field(default=None, ge=0, le=100)


class ReconciliationResponse(BaseModel):
    """Full reconciliation object returned to clients."""

    id: UUID
    name: str
    description: str | None = None
    recon_type: str
    left_source_id: UUID | None = None
    right_source_id: UUID | None = None
    left_source_label: str | None = None
    right_source_label: str | None = None
    tolerance_amount: float
    tolerance_percent: float
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Run / results ────────────────────────────────────────────────────

class ReconRunResponse(BaseModel):
    """Response schema for a single reconciliation run."""

    id: UUID
    reconciliation_id: UUID
    status: str
    triggered_by: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    left_row_count: int | None = None
    right_row_count: int | None = None
    matched_count: int | None = None
    unmatched_left: int | None = None
    unmatched_right: int | None = None
    exception_count: int | None = None
    match_rate: float | None = None
    error_message: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MatchPairResponse(BaseModel):
    """A matched or partially-matched pair of rows."""

    id: UUID
    match_status: str
    confidence_score: float | None = None
    left_amount: float | None = None
    right_amount: float | None = None
    difference: float | None = None
    left_data: dict[str, Any] = Field(default_factory=dict)
    right_data: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class ExceptionResponse(BaseModel):
    """An exception (unmatched or flagged row) from a reconciliation run."""

    id: UUID
    side: str = Field(..., description="'left' or 'right'")
    exception_type: str
    severity: str
    status: str
    assigned_to: str | None = None
    resolution_note: str | None = None
    row_data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
