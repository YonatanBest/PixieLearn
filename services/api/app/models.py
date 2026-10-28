from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DocumentRecord(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_owner_created", "owner_id", "created_at"),
        UniqueConstraint("rendition_storage_key", name="uq_documents_rendition_storage_key"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[str] = mapped_column(String(128), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(127), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="uploaded")
    rendition_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    @property
    def has_rendition(self) -> bool:
        return self.rendition_storage_key is not None


class DocumentPageRecord(Base):
    __tablename__ = "document_pages"
    __table_args__ = (UniqueConstraint("document_id", "page_index", name="uq_document_pages_document_page"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    page_index: Mapped[int] = mapped_column(Integer, nullable=False)
    page_width: Mapped[float] = mapped_column(nullable=False)
    page_height: Mapped[float] = mapped_column(nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    spans: Mapped[list[dict]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    used_ocr: Mapped[bool] = mapped_column(nullable=False, default=False)
    extractor_version: Mapped[str] = mapped_column(String(32), nullable=False)
