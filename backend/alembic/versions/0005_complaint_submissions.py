"""create complaint_submissions table

Records each (report, authority) complaint submission for audit/history.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "complaint_submissions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "report_id",
            sa.String(36),
            sa.ForeignKey("reports.id"),
            nullable=False,
        ),
        sa.Column("authority_key", sa.String(50), nullable=False),
        sa.Column("authority_label", sa.String(255), nullable=False),
        sa.Column("recipient_email", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "submitted_by",
            sa.String(36),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_complaint_submissions_report_id",
        "complaint_submissions",
        ["report_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_complaint_submissions_report_id",
        table_name="complaint_submissions",
    )
    op.drop_table("complaint_submissions")
