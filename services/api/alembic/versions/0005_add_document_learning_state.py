"""Persist per-document learner progress and workspace state.

Revision ID: 0005_document_learning_state
Revises: 0004_retry_legacy_processing
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005_document_learning_state"
down_revision: Union[str, None] = "0004_retry_legacy_processing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_learning_states",
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("page_index", sa.Integer(), nullable=False),
        sa.Column("zoom", sa.Integer(), nullable=False),
        sa.Column("workspace_state", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("last_opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("document_id"),
        sa.CheckConstraint("page_index >= 0", name="ck_document_learning_state_page_index"),
        sa.CheckConstraint("zoom >= 68 AND zoom <= 116", name="ck_document_learning_state_zoom"),
    )


def downgrade() -> None:
    op.drop_table("document_learning_states")
