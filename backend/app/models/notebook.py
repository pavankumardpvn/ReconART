"""Saved notebook query model for the interactive SQL notebook."""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TenantMixin


class SavedNotebookQuery(TenantMixin, Base):
    __tablename__ = "saved_notebook_queries"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sql: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
