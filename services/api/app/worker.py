import logging
import subprocess
import tempfile
from pathlib import Path
from uuid import UUID

from pypdf import PdfReader
from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import DocumentRecord
from app.storage import S3DocumentStorage

logger = logging.getLogger("pixielearn.api.document_worker")
PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
PDF_CONTENT_TYPE = "application/pdf"


def convert_pptx_to_pdf(document_id: str) -> None:
    parsed_id = UUID(document_id)
    settings = get_settings()
    storage = S3DocumentStorage(settings)
    rendition_key = f"documents/{parsed_id}/rendition.pdf"
    rendition_uploaded = False

    with SessionLocal() as session:
        document = session.scalar(select(DocumentRecord).where(DocumentRecord.id == parsed_id))
        if document is None or document.content_type != PPTX_CONTENT_TYPE or document.status != "processing":
            return

        original_key = document.storage_key
        try:
            with tempfile.TemporaryDirectory(prefix="pixielearn-convert-") as temporary_directory:
                work_dir = Path(temporary_directory)
                input_path = work_dir / "original.pptx"
                output_dir = work_dir / "converted"
                profile_dir = work_dir / "libreoffice-profile"
                output_dir.mkdir()
                with input_path.open("wb") as source:
                    storage.download(original_key, source)

                command = [
                    settings.libreoffice_binary,
                    "--headless",
                    f"-env:UserInstallation={profile_dir.as_uri()}",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(output_dir),
                    str(input_path),
                ]
                subprocess.run(
                    command,
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=settings.document_conversion_timeout_seconds,
                )

                pdf_path = output_dir / "original.pdf"
                if not pdf_path.is_file() or pdf_path.stat().st_size == 0:
                    raise RuntimeError("LibreOffice did not produce a PDF rendition.")
                page_count = len(PdfReader(str(pdf_path), strict=True).pages)
                if page_count < 1:
                    raise RuntimeError("The PDF rendition has no pages.")

                with pdf_path.open("rb") as rendition:
                    storage.put(rendition_key, rendition, PDF_CONTENT_TYPE)
                rendition_uploaded = True

            document.rendition_storage_key = rendition_key
            document.page_count = page_count
            document.processing_error = None
            document.status = "ready"
            session.commit()
        except Exception as error:
            session.rollback()
            if rendition_uploaded:
                try:
                    storage.delete(rendition_key)
                except Exception:
                    logger.exception("document_rendition_cleanup_failed document_id=%s", parsed_id)

            failed_document = session.scalar(select(DocumentRecord).where(DocumentRecord.id == parsed_id))
            if failed_document is not None:
                failed_document.status = "failed"
                failed_document.rendition_storage_key = None
                failed_document.page_count = None
                failed_document.processing_error = "PPTX conversion failed. You can retry conversion."
                session.commit()
            logger.error(
                "document_conversion_failed document_id=%s exception_type=%s",
                parsed_id,
                type(error).__name__,
            )
            raise
