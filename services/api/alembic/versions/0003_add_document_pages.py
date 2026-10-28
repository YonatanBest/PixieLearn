"""Persist extracted text and OCR spans by document page.

Revision ID: 0003_document_pages
Revises: 0002_document_renditions
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_document_pages"
down_revision: Union[str, None] = "0002_document_renditions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("page_index", sa.Integer(), nullable=False),
        sa.Column("page_width", sa.Float(), nullable=False),
        sa.Column("page_height", sa.Float(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("spans", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("used_ocr", sa.Boolean(), nullable=False),
        sa.Column("extractor_version", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "page_index", name="uq_document_pages_document_page"),
    )


def downgrade() -> None:
    op.drop_table("document_pages")
