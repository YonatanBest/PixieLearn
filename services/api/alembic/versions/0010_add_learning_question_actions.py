"""Persist validated learning-question action proposals.

Revision ID: 0010_question_actions
Revises: 0009_learning_questions
Create Date: 2026-10-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0010_question_actions"
down_revision: Union[str, None] = "0009_learning_questions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "learning_questions",
        sa.Column("actions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
    )
    op.alter_column("learning_questions", "actions", server_default=None)


def downgrade() -> None:
    op.drop_column("learning_questions", "actions")
