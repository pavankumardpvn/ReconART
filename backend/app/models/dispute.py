"""Dispute management model for exception escalation and tracking."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TIMESTAMP

from app.database import Base
from app.models.base import TenantMixin


class Dispute(TenantMixin, Base):
    __tablename__ = "disputes"

    exception_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exceptions.id"),
        nullable=True,
        index=True,
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recon_runs.id"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'open'")
    )
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'medium'")
    )
    assigned_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Relationships
    exception: Mapped["Exception_ | None"] = relationship()
    run: Mapped["ReconRun | None"] = relationship()
