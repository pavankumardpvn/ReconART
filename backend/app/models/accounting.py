"""Accounting models: journal templates, entries, and entry lines."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TIMESTAMP

from app.database import Base
from app.models.base import TenantMixin


class JournalTemplate(TenantMixin, Base):
    __tablename__ = "journal_templates"

    reconciliation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reconciliations.id"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    entry_rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    reconciliation: Mapped["Reconciliation | None"] = relationship()
    entries: Mapped[list["AccountingEntry"]] = relationship(
        back_populates="template"
    )


class AccountingEntry(TenantMixin, Base):
    __tablename__ = "accounting_entries"

    run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recon_runs.id"),
        nullable=True,
        index=True,
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("journal_templates.id"),
        nullable=True,
        index=True,
    )
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    entry_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default=text("'draft'")
    )
    total_debit: Mapped[Decimal | None] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    total_credit: Mapped[Decimal | None] = mapped_column(
        Numeric(19, 4), nullable=True
    )
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    run: Mapped["ReconRun | None"] = relationship()
    template: Mapped["JournalTemplate | None"] = relationship(back_populates="entries")
    lines: Mapped[list["AccountingEntryLine"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )


class AccountingEntryLine(Base):
    __tablename__ = "accounting_entry_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounting_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    account_code: Mapped[str] = mapped_column(String(50), nullable=False)
    account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    debit_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, server_default=text("0")
    )
    credit_amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, server_default=text("0")
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'USD'")
    )
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    match_pair_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("match_pairs.id"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )

    # Relationships
    entry: Mapped["AccountingEntry"] = relationship(back_populates="lines")
    match_pair: Mapped["MatchPair | None"] = relationship()
