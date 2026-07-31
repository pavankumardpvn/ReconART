"""Workflow models: signoffs, tasks, comments, and attachments."""

import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TIMESTAMP

from app.database import Base
from app.models.base import TenantMixin


class ReconciliationSignoff(TenantMixin, Base):
    """Approval / sign-off record for a reconciliation run."""

    __tablename__ = "reconciliation_signoffs"

    reconciliation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reconciliations.id"),
        nullable=False,
        index=True,
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recon_runs.id"),
        nullable=False,
        index=True,
    )
    prepared_by: Mapped[str] = mapped_column(String(255), nullable=False)
    prepared_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )
    reviewed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'pending_review'")
    )
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    preparer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class ReconciliationTask(TenantMixin, Base):
    """Calendar / deadline task linked to a reconciliation."""

    __tablename__ = "reconciliation_tasks"

    reconciliation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reconciliations.id"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[str] = mapped_column(String(255), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'medium'")
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'pending'")
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )


class Comment(TenantMixin, Base):
    """Threaded comment attached to any entity (reconciliation, exception, run, etc.)."""

    __tablename__ = "comments"

    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("comments.id"),
        nullable=True,
        index=True,
    )


class Attachment(TenantMixin, Base):
    """File attachment linked to any entity."""

    __tablename__ = "attachments"

    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(255), nullable=False)
