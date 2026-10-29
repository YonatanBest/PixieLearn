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
from app.models import DocumentPageRecord, DocumentRecord
from app.worker import process_document


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

    def get_size(self, key: str) -> int:
        return len(self.objects[key])

    def get_range(self, key: str, start: int, end: int) -> tuple[bytes, int]:
        content = self.objects[key]
        return content[start : end + 1], len(content)


def create_worker_database(
    monkeypatch: pytest.MonkeyPatch,
    document_id,
    content_type: str = PPTX_CONTENT_TYPE,
) -> tuple[sessionmaker, str]:
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
                filename="slides.pptx" if content_type == PPTX_CONTENT_TYPE else "lecture.pdf",
                content_type=content_type,
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
    monkeypatch.setattr(
        worker,
        "extract_pdf_pages",
        lambda *_args: iter(
            [
                {
                    "page_index": 0,
                    "page_width": 100,
                    "page_height": 100,
                    "text": "Slide one",
                    "spans": [],
                    "used_ocr": False,
                    "extractor_version": "1",
                },
                {
                    "page_index": 1,
                    "page_width": 100,
                    "page_height": 100,
                    "text": "Slide two",
                    "spans": [],
                    "used_ocr": True,
                    "extractor_version": "1",
                },
            ]
        ),
    )
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

    process_document(str(document_id))

    with sessions() as session:
        document = session.scalar(select(DocumentRecord).where(DocumentRecord.id == document_id))
        assert document is not None
        assert document.status == "ready"
        assert document.page_count == 2
        assert document.rendition_storage_key == f"documents/{document_id}/rendition.pdf"
        assert document.processing_error is None
        pages = session.scalars(
            select(DocumentPageRecord).where(DocumentPageRecord.document_id == document_id).order_by(DocumentPageRecord.page_index)
        ).all()
        assert [page.text for page in pages] == ["Slide one", "Slide two"]
        assert [page.used_ocr for page in pages] == [False, True]
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
        process_document(str(document_id))

    with sessions() as session:
        document = session.scalar(select(DocumentRecord).where(DocumentRecord.id == document_id))
        assert document is not None
        assert document.status == "failed"
        assert document.processing_error == "Document conversion failed. You can retry processing."
        assert document.rendition_storage_key is None
    assert storage.objects == {original_key: original}


def test_pdf_text_processing_saves_pages_before_marking_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import worker

    document_id = uuid4()
    original = b"a pdf uploaded by the learner"
    sessions, original_key = create_worker_database(monkeypatch, document_id, content_type="application/pdf")
    storage = MemoryDocumentStorage(original_key, original)
    monkeypatch.setattr(worker, "S3DocumentStorage", lambda _settings: storage)

    def extract_pages(pdf_path, _settings):
        assert pdf_path.read_bytes() == original
        yield {
            "page_index": 0,
            "page_width": 612,
            "page_height": 792,
            "text": "Native page",
            "spans": [{"id": "p00000-w00000", "text": "Native", "source": "native"}],
            "used_ocr": False,
            "extractor_version": "1",
        }

    monkeypatch.setattr(worker, "extract_pdf_pages", extract_pages)

    process_document(str(document_id))

    with sessions() as session:
        document = session.scalar(select(DocumentRecord).where(DocumentRecord.id == document_id))
        page = session.scalar(select(DocumentPageRecord).where(DocumentPageRecord.document_id == document_id))
        assert document is not None and document.status == "ready" and document.page_count == 1
        assert page is not None and page.text == "Native page"
    assert storage.objects == {original_key: original}


def test_worker_does_not_process_a_document_marked_for_deletion(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import worker

    document_id = uuid4()
    sessions, original_key = create_worker_database(monkeypatch, document_id)
    with sessions() as session:
        document = session.get(DocumentRecord, document_id)
        assert document is not None
        document.status = "deleting"
        session.commit()
    storage = MemoryDocumentStorage(original_key, b"private original")
    monkeypatch.setattr(worker, "S3DocumentStorage", lambda _settings: storage)

    process_document(str(document_id))

    assert storage.objects == {original_key: b"private original"}
    with sessions() as session:
        document = session.get(DocumentRecord, document_id)
        assert document is not None
        assert document.status == "deleting"


def test_page_failure_removes_partial_page_rows_and_keeps_the_original(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import worker

    document_id = uuid4()
    original = b"a pdf uploaded by the learner"
    sessions, original_key = create_worker_database(monkeypatch, document_id, content_type="application/pdf")
    storage = MemoryDocumentStorage(original_key, original)
    monkeypatch.setattr(worker, "S3DocumentStorage", lambda _settings: storage)

    def fail_after_first_page(_pdf_path, _settings):
        yield {
            "page_index": 0,
            "page_width": 612,
            "page_height": 792,
            "text": "Partial page",
            "spans": [],
            "used_ocr": False,
            "extractor_version": "1",
        }
        raise RuntimeError("OCR did not complete")

    monkeypatch.setattr(worker, "extract_pdf_pages", fail_after_first_page)

    with pytest.raises(RuntimeError, match="OCR did not complete"):
        process_document(str(document_id))

    with sessions() as session:
        document = session.scalar(select(DocumentRecord).where(DocumentRecord.id == document_id))
        pages = session.scalars(select(DocumentPageRecord).where(DocumentPageRecord.document_id == document_id)).all()
        assert document is not None and document.status == "failed"
        assert document.processing_error == "Document text extraction failed. You can retry processing."
        assert pages == []
    assert storage.objects == {original_key: original}


def test_retry_reuses_an_existing_rendition_and_reprocesses_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import worker

    document_id = uuid4()
    original = b"private original pptx bytes"
    sessions, original_key = create_worker_database(monkeypatch, document_id)
    rendition_key = f"documents/{document_id}/rendition.pdf"
    storage = MemoryDocumentStorage(original_key, original)
    storage.objects[rendition_key] = b"previously converted PDF"
    with sessions() as session:
        document = session.scalar(select(DocumentRecord).where(DocumentRecord.id == document_id))
        assert document is not None
        document.status = "processing"
        document.rendition_storage_key = rendition_key
        document.page_count = 1
        session.commit()
    monkeypatch.setattr(worker, "S3DocumentStorage", lambda _settings: storage)
    monkeypatch.setattr(
        worker.subprocess,
        "run",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("retry should reuse the PDF rendition")),
    )
    monkeypatch.setattr(
        worker,
        "extract_pdf_pages",
        lambda *_args: iter(
            [
                {
                    "page_index": 0,
                    "page_width": 612,
                    "page_height": 792,
                    "text": "Retry succeeded",
                    "spans": [],
                    "used_ocr": True,
                    "extractor_version": "1",
                }
            ]
        ),
    )

    process_document(str(document_id))

    with sessions() as session:
        document = session.scalar(select(DocumentRecord).where(DocumentRecord.id == document_id))
        page = session.scalar(select(DocumentPageRecord).where(DocumentPageRecord.document_id == document_id))
        assert document is not None and document.status == "ready"
        assert document.rendition_storage_key == rendition_key
        assert page is not None and page.text == "Retry succeeded"
    assert storage.objects == {original_key: original, rendition_key: b"previously converted PDF"}
