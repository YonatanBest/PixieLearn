from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

import pytest
from pypdf import PdfWriter
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.database import Base
from app.models import DocumentRecord
from app.worker import convert_pptx_to_pdf


PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


class MemoryDocumentStorage:
    def __init__(self, original_key: str, original: bytes) -> None:
        self.objects = {original_key: original}

    def download(self, key: str, destination: BytesIO) -> None:
        destination.write(self.objects[key])

    def put(self, key: str, body: BytesIO, content_type: str) -> None:
        assert content_type == "application/pdf"
        self.objects[key] = body.read()

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)


def create_worker_database(monkeypatch: pytest.MonkeyPatch, document_id) -> tuple[sessionmaker, str]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    original_key = f"documents/{document_id}/original"
    with sessions() as session:
        session.add(
            DocumentRecord(
                id=document_id,
                owner_id="learner-worker-test",
                filename="slides.pptx",
                content_type=PPTX_CONTENT_TYPE,
                size_bytes=20,
                storage_key=original_key,
                status="processing",
                created_at=datetime.now(UTC),
            )
        )
        session.commit()
    monkeypatch.setattr("app.worker.SessionLocal", sessions)
    monkeypatch.setattr("app.worker.get_settings", lambda: Settings(document_conversion_timeout_seconds=90))
    return sessions, original_key


def test_conversion_stores_a_pdf_rendition_and_stable_page_count(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import worker

    document_id = uuid4()
    original = b"private original pptx bytes"
    sessions, original_key = create_worker_database(monkeypatch, document_id)
    storage = MemoryDocumentStorage(original_key, original)
    monkeypatch.setattr(worker, "S3DocumentStorage", lambda _settings: storage)
    commands: list[list[str]] = []

    def convert(command: list[str], **_kwargs) -> None:
        commands.append(command)
        output_directory = command[command.index("--outdir") + 1]
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        writer.add_blank_page(width=100, height=100)
        with open(f"{output_directory}/original.pdf", "wb") as pdf:
            writer.write(pdf)

    monkeypatch.setattr(worker.subprocess, "run", convert)

    convert_pptx_to_pdf(str(document_id))

    with sessions() as session:
        document = session.scalar(select(DocumentRecord).where(DocumentRecord.id == document_id))
        assert document is not None
        assert document.status == "ready"
        assert document.page_count == 2
        assert document.rendition_storage_key == f"documents/{document_id}/rendition.pdf"
        assert document.processing_error is None
    assert storage.objects[original_key] == original
    assert storage.objects[f"documents/{document_id}/rendition.pdf"].startswith(b"%PDF-")
    assert "--headless" in commands[0]
    assert commands[0][commands[0].index("--convert-to") + 1] == "pdf"


def test_conversion_failure_marks_document_retryable_and_keeps_original(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import worker

    document_id = uuid4()
    original = b"private original pptx bytes"
    sessions, original_key = create_worker_database(monkeypatch, document_id)
    storage = MemoryDocumentStorage(original_key, original)
    monkeypatch.setattr(worker, "S3DocumentStorage", lambda _settings: storage)
    monkeypatch.setattr(
        worker.subprocess,
        "run",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(worker.subprocess.CalledProcessError(1, "libreoffice")),
    )

    with pytest.raises(worker.subprocess.CalledProcessError):
        convert_pptx_to_pdf(str(document_id))

    with sessions() as session:
        document = session.scalar(select(DocumentRecord).where(DocumentRecord.id == document_id))
        assert document is not None
        assert document.status == "failed"
        assert document.processing_error == "PPTX conversion failed. You can retry conversion."
        assert document.rendition_storage_key is None
    assert storage.objects == {original_key: original}
