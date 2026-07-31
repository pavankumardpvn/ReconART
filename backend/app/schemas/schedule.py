"""Schedule schemas for recurring reconciliation runs."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ScheduleCreate(BaseModel):
    """Schema for creating a reconciliation schedule."""

    reconciliation_id: UUID
    name: str | None = None
    cron_expression: str = Field(
        ..., min_length=9, max_length=100, description="Cron expression (e.g. '0 8 * * *')"
    )
    timezone: str = Field(default="UTC", max_length=50)


class ScheduleUpdate(BaseModel):
    """Schema for updating an existing schedule."""

    name: str | None = None
    cron_expression: str | None = Field(
        default=None, min_length=9, max_length=100
    )
    timezone: str | None = Field(default=None, max_length=50)
    is_active: bool | None = None


class ScheduleResponse(BaseModel):
    """Full schedule response returned to clients."""

    id: UUID
    reconciliation_id: UUID
    name: str | None = None
    cron_expression: str
    timezone: str
    is_active: bool
    next_run_at: datetime | None = None
    last_run_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
