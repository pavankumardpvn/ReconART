"""Add workflow models

Revision ID: a1b2c3d4e5f6
Revises: 3c3440bfecfe
Create Date: 2026-07-31 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '3c3440bfecfe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- reconciliation_signoffs ---
    op.create_table(
        'reconciliation_signoffs',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('reconciliation_id', sa.UUID(), nullable=False),
        sa.Column('run_id', sa.UUID(), nullable=False),
        sa.Column('prepared_by', sa.String(255), nullable=False),
        sa.Column('prepared_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('reviewed_by', sa.String(255), nullable=True),
        sa.Column('reviewed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('status', sa.String(50), server_default=sa.text("'pending_review'"), nullable=False),
        sa.Column('reviewer_notes', sa.Text(), nullable=True),
        sa.Column('preparer_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['reconciliation_id'], ['reconciliations.id']),
        sa.ForeignKeyConstraint(['run_id'], ['recon_runs.id']),
    )
    op.create_index(op.f('ix_reconciliation_signoffs_tenant_id'), 'reconciliation_signoffs', ['tenant_id'])
    op.create_index(op.f('ix_reconciliation_signoffs_reconciliation_id'), 'reconciliation_signoffs', ['reconciliation_id'])
    op.create_index(op.f('ix_reconciliation_signoffs_run_id'), 'reconciliation_signoffs', ['run_id'])

    # --- reconciliation_tasks ---
    op.create_table(
        'reconciliation_tasks',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('reconciliation_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('assigned_to', sa.String(255), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('priority', sa.String(20), server_default=sa.text("'medium'"), nullable=False),
        sa.Column('status', sa.String(50), server_default=sa.text("'pending'"), nullable=False),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['reconciliation_id'], ['reconciliations.id']),
    )
    op.create_index(op.f('ix_reconciliation_tasks_tenant_id'), 'reconciliation_tasks', ['tenant_id'])
    op.create_index(op.f('ix_reconciliation_tasks_reconciliation_id'), 'reconciliation_tasks', ['reconciliation_id'])

    # --- comments ---
    op.create_table(
        'comments',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.String(255), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('parent_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['parent_id'], ['comments.id']),
    )
    op.create_index(op.f('ix_comments_tenant_id'), 'comments', ['tenant_id'])
    op.create_index(op.f('ix_comments_entity_type'), 'comments', ['entity_type'])
    op.create_index(op.f('ix_comments_entity_id'), 'comments', ['entity_id'])
    op.create_index(op.f('ix_comments_parent_id'), 'comments', ['parent_id'])

    # --- attachments ---
    op.create_table(
        'attachments',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.UUID(), nullable=False),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('file_path', sa.Text(), nullable=False),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('content_type', sa.String(100), nullable=False),
        sa.Column('uploaded_by', sa.String(255), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
    )
    op.create_index(op.f('ix_attachments_tenant_id'), 'attachments', ['tenant_id'])
    op.create_index(op.f('ix_attachments_entity_type'), 'attachments', ['entity_type'])
    op.create_index(op.f('ix_attachments_entity_id'), 'attachments', ['entity_id'])


def downgrade() -> None:
    op.drop_table('attachments')
    op.drop_table('comments')
    op.drop_table('reconciliation_tasks')
    op.drop_table('reconciliation_signoffs')
