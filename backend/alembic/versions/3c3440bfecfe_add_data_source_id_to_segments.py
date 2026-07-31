"""Add data_source_id to segments

Revision ID: 3c3440bfecfe
Revises: d7789096c36b
Create Date: 2026-07-31 09:00:37.630910
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3c3440bfecfe'
down_revision: Union[str, None] = 'd7789096c36b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('segments', sa.Column('data_source_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_segments_data_source_id'), 'segments', ['data_source_id'], unique=False)
    op.create_foreign_key('fk_segments_data_source_id', 'segments', 'data_sources', ['data_source_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    op.drop_constraint('fk_segments_data_source_id', 'segments', type_='foreignkey')
    op.drop_index(op.f('ix_segments_data_source_id'), table_name='segments')
    op.drop_column('segments', 'data_source_id')
