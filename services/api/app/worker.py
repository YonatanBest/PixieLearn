import logging
import subprocess
import tempfile
from pathlib import Path
from uuid import UUID

from pypdf import PdfReader
from sqlalchemy import delete, select

from app.config import get_settings
from app.database import SessionLocal
from app.models import DocumentPageRecord, DocumentRecord
from app.page_text import extract_pdf_pages
from app.storage import S3DocumentStorage

logger = logging.getLogger("pixielearn.api.document_worker")
PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
PDF_CONTENT_TYPE = "application/pdf"


class DocumentDeletionRequested(Exception):
    pass


def _lock_processing_document(session, document_id: UUID) -> DocumentRecord:
    document = session.scalar(
        select(DocumentRecord).where(DocumentRecord.id == document_id).with_for_update()
    )
    if document is None or document.status != "processing":
        raise DocumentDeletionRequested
    return document


def _convert_pptx(source: Path, output_directory: Path, settings) -> Path:
    output_directory.mkdir()
    profile_dir = output_directory.parent / "libreoffice-profile"
    command = [
        settings.libreoffice_binary,
        "--headless",
        f"-env:UserInstallation={profile_dir.as_uri()}",
        "--convert-to",
        "pdf",
        "--outdir",
        str(output_directory),
        str(source),
    ]
    subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        timeout=settings.document_conversion_timeout_seconds,
    )
    pdf_path = output_directory / f"{source.stem}.pdf"
    if not pdf_path.is_file() or pdf_path.stat().st_size == 0:
        raise RuntimeError("LibreOffice did not produce a PDF rendition.")
    if len(PdfReader(str(pdf_path), strict=True).pages) < 1:
        raise RuntimeError("The PDF rendition has no pages.")
    return pdf_path


def process_document(document_id: str) -> None:
    parsed_id = UUID(document_id)
    settings = get_settings()
    storage = S3DocumentStorage(settings)
    with SessionLocal() as session:
        document = session.scalar(
            select(DocumentRecord).where(DocumentRecord.id == parsed_id).with_for_update()
        )
        if document is None or document.status != "processing":
            return

        stage = "conversion" if document.content_type == PPTX_CONTENT_TYPE else "text extraction"
        try:
            session.execute(delete(DocumentPageRecord).where(DocumentPageRecord.document_id == parsed_id))
            session.commit()
            with tempfile.TemporaryDirectory(prefix="pixielearn-document-") as temporary_directory:
                work_dir = Path(temporary_directory)
                pdf_path = work_dir / "source.pdf"
                if document.content_type == PPTX_CONTENT_TYPE:
                    if document.rendition_storage_key:
                        with pdf_path.open("wb") as destination:
                            storage.download(document.rendition_storage_key, destination)
                    else:
                        original_path = work_dir / "original.pptx"
                        with original_path.open("wb") as destination:
                            storage.download(document.storage_key, destination)
                        converted_path = _convert_pptx(original_path, work_dir / "converted", settings)
                        rendition_key = f"documents/{parsed_id}/rendition.pdf"
                        document = _lock_processing_document(session, parsed_id)
                        with converted_path.open("rb") as rendition:
                            storage.put(rendition_key, rendition, PDF_CONTENT_TYPE)
                        document.rendition_storage_key = rendition_key
                        document.page_count = len(PdfReader(str(converted_path), strict=True).pages)
                        session.commit()
                        pdf_path = converted_path
                else:
                    with pdf_path.open("wb") as destination:
                        storage.download(document.storage_key, destination)

                stage = "text extraction"
                pages_processed = 0
                for page in extract_pdf_pages(pdf_path, settings):
                    document = _lock_processing_document(session, parsed_id)
                    session.add(
                        DocumentPageRecord(
                            document_id=parsed_id,
                            page_index=page["page_index"],
                            page_width=page["page_width"],
                            page_height=page["page_height"],
                            text=page["text"],
                            spans=page["spans"],
                            used_ocr=page["used_ocr"],
                            extractor_version=page["extractor_version"],
                        )
                    )
                    session.commit()
                    pages_processed += 1

                if pages_processed < 1:
                    raise RuntimeError("The PDF has no pages to process.")

            document = _lock_processing_document(session, parsed_id)
            document.page_count = pages_processed
            document.processing_error = None
            document.status = "ready"
            session.commit()
        except DocumentDeletionRequested:
            session.rollback()
            return
        except Exception as error:
            session.rollback()
            failed_document = session.scalar(
                select(DocumentRecord).where(DocumentRecord.id == parsed_id).with_for_update()
            )
            if failed_document is None or failed_document.status == "deleting":
                return
            if failed_document.status != "processing":
                return
            session.execute(delete(DocumentPageRecord).where(DocumentPageRecord.document_id == parsed_id))
            failed_document.status = "failed"
            failed_document.processing_error = (
                "Document conversion failed. You can retry processing."
                if stage == "conversion"
                else "Document text extraction failed. You can retry processing."
            )
            session.commit()
            logger.error(
                "document_processing_failed document_id=%s stage=%s exception_type=%s",
                parsed_id,
                stage,
                type(error).__name__,
            )
            raise


def convert_pptx_to_pdf(document_id: str) -> None:
    """Compatibility entry point for jobs queued before the unified pipeline."""
    process_document(document_id)
