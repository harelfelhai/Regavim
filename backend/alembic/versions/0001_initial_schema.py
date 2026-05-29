"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "reports",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("ai_category", sa.String(50), nullable=True),
        sa.Column("final_category", sa.String(50), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("land_context", sa.String(255), nullable=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_lat", sa.Float(), nullable=True),
        sa.Column("user_lng", sa.Float(), nullable=True),
        sa.Column("target_lat", sa.Float(), nullable=True),
        sa.Column("target_lng", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "images",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("report_id", sa.String(36), nullable=False),
        sa.Column("file_path", sa.String(512), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("exif_data", sa.JSON(), nullable=True),
        sa.Column("has_exif", sa.Boolean(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("images")
    op.drop_table("reports")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
