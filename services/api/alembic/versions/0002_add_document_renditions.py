"""Add PPTX rendition metadata.

Revision ID: 0002_document_renditions
Revises: 0001_create_documents
Create Date: 2026-10-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_document_renditions"
down_revision: Union[str, None] = "0001_create_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("rendition_storage_key", sa.String(length=512), nullable=True))
    op.create_unique_constraint("uq_documents_rendition_storage_key", "documents", ["rendition_storage_key"])
    op.add_column("documents", sa.Column("page_count", sa.Integer(), nullable=True))
    op.add_column("documents", sa.Column("processing_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "processing_error")
    op.drop_column("documents", "page_count")
    op.drop_constraint("uq_documents_rendition_storage_key", "documents", type_="unique")
    op.drop_column("documents", "rendition_storage_key")
