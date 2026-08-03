"""Matching engine models: runs, match pairs, match items, exceptions."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TIMESTAMP

from app.database import Base
from app.models.base import TenantMixin


class ReconRun(Base):
    __tablename__ = "recon_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    reconciliation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reconciliations.id"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'pending'"), index=True,
    )
    triggered_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, index=True,
    )
    left_row_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    right_row_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    matched_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    unmatched_left: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    unmatched_right: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    exception_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    match_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 4), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )

    # Relationships
    reconciliation: Mapped["Reconciliation"] = relationship(back_populates="runs")
    match_pairs: Mapped[list["MatchPair"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )
    exceptions: Mapped[list["Exception_"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class MatchPair(Base):
    __tablename__ = "match_pairs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recon_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id"),
        nullable=False,
        index=True,
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recon_rules.id"),
        nullable=True,
        index=True,
    )
    match_status: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    confidence_score: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 4), nullable=True
    )
    left_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    right_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    difference: Mapped[Decimal | None] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    match_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )

    # Relationships
    run: Mapped["ReconRun"] = relationship(back_populates="match_pairs")
    items: Mapped[list["MatchPairItem"]] = relationship(
        back_populates="match_pair", cascade="all, delete-orphan"
    )
    rule: Mapped["ReconRule | None"] = relationship()


class MatchPairItem(Base):
    __tablename__ = "match_pair_items"
    __table_args__ = (
        UniqueConstraint(
            "match_pair_id", "data_source_row_id", name="uq_match_pair_item"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    match_pair_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("match_pairs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_source_row_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("data_source_rows.id"),
        nullable=False,
        index=True,
    )
    side: Mapped[str] = mapped_column(String(10), nullable=False)

    # Relationships
    match_pair: Mapped["MatchPair"] = relationship(back_populates="items")
    data_source_row: Mapped["DataSourceRow"] = relationship()


class Exception_(Base):
    """Reconciliation exception (named Exception_ to avoid shadowing Python's Exception)."""

    __tablename__ = "exceptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recon_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id"),
        nullable=False,
        index=True,
    )
    data_source_row_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("data_source_rows.id"),
        nullable=False,
        index=True,
    )
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    exception_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'medium'")
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'open'"), index=True,
    )
    assigned_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    resolved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
        onupdate=text("now()"),
        nullable=False,
    )

    # Relationships
    run: Mapped["ReconRun"] = relationship(back_populates="exceptions")
    data_source_row: Mapped["DataSourceRow"] = relationship()
