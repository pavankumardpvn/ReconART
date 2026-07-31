"""Dashboard and analytics schemas."""

from pydantic import BaseModel, ConfigDict, Field


class DashboardSummary(BaseModel):
    """High-level KPIs for the dashboard overview."""

    total_reconciliations: int = 0
    total_runs: int = 0
    average_match_rate: float = Field(default=0.0, ge=0.0, le=100.0)
    open_exceptions: int = 0
    runs_this_month: int = 0
    recent_runs: list = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class MatchRateTrend(BaseModel):
    """Single data point for the match-rate-over-time chart."""

    date: str = Field(..., description="ISO date string (YYYY-MM-DD)")
    match_rate: float = Field(ge=0.0, le=100.0)
    run_count: int = Field(ge=0)

    model_config = ConfigDict(from_attributes=True)
