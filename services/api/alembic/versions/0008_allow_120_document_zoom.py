"""Allow the configured 120% default document zoom.

Revision ID: 0008_zoom_120
Revises: 0007_user_settings
Create Date: 2026-10-27
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0008_zoom_120"
down_revision: Union[str, None] = "0007_user_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_document_learning_state_zoom", "document_learning_states", type_="check")
    op.create_check_constraint(
        "ck_document_learning_state_zoom",
        "document_learning_states",
        "zoom >= 68 AND zoom <= 120",
    )


def downgrade() -> None:
    op.drop_constraint("ck_document_learning_state_zoom", "document_learning_states", type_="check")
    op.create_check_constraint(
        "ck_document_learning_state_zoom",
        "document_learning_states",
        "zoom >= 68 AND zoom <= 116",
    )
