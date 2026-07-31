"""Reconciliation, rules, and rule condition models."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TIMESTAMP

from app.database import Base
from app.models.base import TenantMixin


class Reconciliation(TenantMixin, Base):
    __tablename__ = "reconciliations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    recon_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    left_source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id"),
        nullable=True,
        index=True,
    )
    right_source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id"),
        nullable=True,
        index=True,
    )
    left_source_label: Mapped[str] = mapped_column(
        String(100), nullable=False, server_default=text("'Source A'")
    )
    right_source_label: Mapped[str] = mapped_column(
        String(100), nullable=False, server_default=text("'Source B'")
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'draft'")
    )
    tolerance_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, server_default=text("0")
    )
    tolerance_percent: Mapped[Decimal] = mapped_column(
        Numeric(8, 4), nullable=False, server_default=text("0")
    )
    settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    # Relationships
    left_source: Mapped["DataSource | None"] = relationship(foreign_keys=[left_source_id])
    right_source: Mapped["DataSource | None"] = relationship(foreign_keys=[right_source_id])
    rules: Mapped[list["ReconRule"]] = relationship(
        back_populates="reconciliation", cascade="all, delete-orphan"
    )
    runs: Mapped[list["ReconRun"]] = relationship(back_populates="reconciliation")
    segments: Mapped[list["Segment"]] = relationship(
        primaryjoin="Reconciliation.id == foreign(Segment.reconciliation_id)",
    )


class ReconRule(TenantMixin, Base):
    __tablename__ = "recon_rules"

    reconciliation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reconciliations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    priority: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    match_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )

    # Relationships
    reconciliation: Mapped["Reconciliation"] = relationship(back_populates="rules")
    conditions: Mapped[list["ReconRuleCondition"]] = relationship(
        back_populates="rule", cascade="all, delete-orphan"
    )


class ReconRuleCondition(Base):
    __tablename__ = "recon_rule_conditions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recon_rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    left_column: Mapped[str] = mapped_column(String(255), nullable=False)
    right_column: Mapped[str] = mapped_column(String(255), nullable=False)
    comparison: Mapped[str] = mapped_column(String(50), nullable=False)
    tolerance_value: Mapped[Decimal | None] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    fuzzy_threshold: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    is_key: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )

    # Relationships
    rule: Mapped["ReconRule"] = relationship(back_populates="conditions")
