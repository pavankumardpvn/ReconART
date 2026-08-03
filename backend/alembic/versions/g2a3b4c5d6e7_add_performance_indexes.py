"""Add performance indexes on frequently-queried columns.

Revision ID: g2a3b4c5d6e7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-03

"""
from alembic import op

revision = "g2a3b4c5d6e7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_recon_runs_status", "recon_runs", ["status"])
    op.create_index("ix_recon_runs_completed_at", "recon_runs", ["completed_at"])
    op.create_index("ix_match_pairs_match_status", "match_pairs", ["match_status"])
    op.create_index("ix_exceptions_status", "exceptions", ["status"])
    op.create_index("ix_exceptions_exception_type", "exceptions", ["exception_type"])
    op.create_index("ix_exceptions_created_at", "exceptions", ["created_at"])
    op.create_index("ix_reconciliations_status", "reconciliations", ["status"])


def downgrade() -> None:
    op.drop_index("ix_reconciliations_status", "reconciliations")
    op.drop_index("ix_exceptions_created_at", "exceptions")
    op.drop_index("ix_exceptions_exception_type", "exceptions")
    op.drop_index("ix_exceptions_status", "exceptions")
    op.drop_index("ix_match_pairs_match_status", "match_pairs")
    op.drop_index("ix_recon_runs_completed_at", "recon_runs")
    op.drop_index("ix_recon_runs_status", "recon_runs")
