"""make images.report_id nullable and add images.ai_category

Images are now uploaded and analysed before their report exists (staged),
so report_id must be nullable, and the AI suggestion is stored on the image
until the report is created.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-28

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch_alter_table is required for SQLite, which cannot ALTER COLUMN directly.
    with op.batch_alter_table("images") as batch_op:
        batch_op.add_column(sa.Column("ai_category", sa.String(50), nullable=True))
        batch_op.alter_column("report_id", existing_type=sa.String(36), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("images") as batch_op:
        batch_op.alter_column("report_id", existing_type=sa.String(36), nullable=False)
        batch_op.drop_column("ai_category")
