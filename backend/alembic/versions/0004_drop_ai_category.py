"""drop ai_category columns from reports and images

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-28

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("reports") as batch_op:
        batch_op.drop_column("ai_category")

    with op.batch_alter_table("images") as batch_op:
        batch_op.drop_column("ai_category")


def downgrade() -> None:
    with op.batch_alter_table("reports") as batch_op:
        batch_op.add_column(sa.Column("ai_category", sa.String(50), nullable=True))

    with op.batch_alter_table("images") as batch_op:
        batch_op.add_column(sa.Column("ai_category", sa.String(50), nullable=True))
