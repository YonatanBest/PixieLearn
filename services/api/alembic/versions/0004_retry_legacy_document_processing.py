"""Make existing documents eligible for page text processing.

Revision ID: 0004_retry_legacy_processing
Revises: 0003_document_pages
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004_retry_legacy_processing"
down_revision: Union[str, None] = "0003_document_pages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE documents
        SET status = 'failed',
            processing_error = 'Document page processing is pending. You can retry processing.'
        WHERE status IN ('uploaded', 'ready')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE documents
        SET status = CASE
                WHEN content_type = 'application/pdf' THEN 'uploaded'
                ELSE 'ready'
            END,
            processing_error = NULL
        WHERE status = 'failed'
          AND processing_error = 'Document page processing is pending. You can retry processing.'
        """
    )
