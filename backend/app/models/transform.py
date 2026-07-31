"""Transform models: calculated columns, unions, joins, groups."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TIMESTAMP

from app.database import Base
from app.models.base import TenantMixin


class CalculatedColumn(TenantMixin, Base):
    __tablename__ = "calculated_columns"

    data_source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    expression: Mapped[str] = mapped_column(Text, nullable=False)
    result_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Relationships
    data_source: Mapped["DataSource"] = relationship()


class Union(TenantMixin, Base):
    __tablename__ = "unions"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    members: Mapped[list["UnionMember"]] = relationship(
        back_populates="union", cascade="all, delete-orphan"
    )


class UnionMember(Base):
    __tablename__ = "union_members"
    __table_args__ = (
        UniqueConstraint("union_id", "data_source_id", name="uq_union_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    union_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id"),
        nullable=False,
        index=True,
    )
    column_mapping: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ordinal: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    union: Mapped["Union"] = relationship(back_populates="members")
    data_source: Mapped["DataSource"] = relationship()


class Join(TenantMixin, Base):
    __tablename__ = "joins"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    left_source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id"),
        nullable=False,
        index=True,
    )
    right_source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id"),
        nullable=False,
        index=True,
    )
    join_type: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'inner'")
    )
    join_conditions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_columns: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    left_source: Mapped["DataSource"] = relationship(foreign_keys=[left_source_id])
    right_source: Mapped["DataSource"] = relationship(foreign_keys=[right_source_id])


class Group(TenantMixin, Base):
    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id"),
        nullable=False,
        index=True,
    )
    group_by_columns: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    aggregations: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    source: Mapped["DataSource"] = relationship()
