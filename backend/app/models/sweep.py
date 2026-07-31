"""Sweep, compensation, and consolidation models."""

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TenantMixin


class Sweep(TenantMixin, Base):
    __tablename__ = "sweeps"

    reconciliation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reconciliations.id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sweep_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )

    # Relationships
    reconciliation: Mapped["Reconciliation"] = relationship()


class Compensation(TenantMixin, Base):
    __tablename__ = "compensations"

    reconciliation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reconciliations.id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    compensation_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    threshold_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    auto_apply: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    reconciliation: Mapped["Reconciliation"] = relationship()


class Consolidation(TenantMixin, Base):
    __tablename__ = "consolidations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    child_recon_ids: Mapped[list[uuid.UUID] | None] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=True
    )
    consolidation_rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
