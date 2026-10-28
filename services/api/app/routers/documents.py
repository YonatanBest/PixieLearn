import logging
import xml.etree.ElementTree as ET
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import PurePath
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.dependencies.auth import require_authenticated_user
from app.document_queue import DocumentQueue, QueueUnavailableError, get_document_queue
from app.models import DocumentRecord
from app.schemas.auth import AuthUser
from app.schemas.documents import DocumentRead, DownloadUrlRead
from app.storage import DocumentStorage, StorageUnavailableError, get_document_storage

logger = logging.getLogger("pixielearn.api.documents")
router = APIRouter(prefix="/api/documents", tags=["documents"])

PDF_CONTENT_TYPE = "application/pdf"
PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def _validate_upload(file: UploadFile, settings: Settings) -> tuple[str, str, int]:
    filename = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    if not filename or len(filename) > 255:
        raise HTTPException(status_code=422, detail="Choose a file with a valid name.")

    extension = PurePath(filename).suffix.lower()
    if extension not in {".pdf", ".pptx"}:
        raise HTTPException(status_code=415, detail="Only PDF and PPTX files are supported.")

    stream = file.file
    stream.seek(0, 2)
    size_bytes = stream.tell()
    stream.seek(0)
    if size_bytes == 0:
        raise HTTPException(status_code=422, detail="The selected file is empty.")
    if size_bytes > settings.document_max_size_bytes:
        limit_mib = settings.document_max_size_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Files must be {limit_mib} MiB or smaller.")

    if extension == ".pdf":
        if stream.read(8).lstrip()[:5] != b"%PDF-":
            raise HTTPException(status_code=422, detail="The selected file is not a valid PDF.")
        stream.seek(max(0, size_bytes - 1024))
        if b"%%EOF" not in stream.read():
            raise HTTPException(status_code=422, detail="The selected file is not a valid PDF.")
        content_type = PDF_CONTENT_TYPE
    else:
        try:
            with zipfile.ZipFile(stream) as archive:
                names = set(archive.namelist())
                structurally_valid = (
                    archive.testzip() is None
                    and ET.fromstring(archive.read("[Content_Types].xml")).tag.endswith("Types")
                    and ET.fromstring(archive.read("ppt/presentation.xml")).tag.endswith("presentation")
                )
        except (OSError, KeyError, ET.ParseError, zipfile.BadZipFile):
            names = set()
            structurally_valid = False
        if not structurally_valid or "[Content_Types].xml" not in names or "ppt/presentation.xml" not in names:
            raise HTTPException(status_code=422, detail="The selected file is not a valid PPTX presentation.")
        content_type = PPTX_CONTENT_TYPE

    stream.seek(0)
    return filename, content_type, size_bytes


def _document_or_404(session: Session, document_id: str, owner_id: str) -> DocumentRecord:
    try:
        parsed_id = UUID(document_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Document not found.") from error
    document = session.scalar(
        select(DocumentRecord).where(
            DocumentRecord.id == parsed_id,
            DocumentRecord.owner_id == owner_id,
        )
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
def upload_document(
    file: UploadFile = File(...),
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
    storage: DocumentStorage = Depends(get_document_storage),
    queue: DocumentQueue = Depends(get_document_queue),
    settings: Settings = Depends(get_settings),
) -> DocumentRecord:
    filename, content_type, size_bytes = _validate_upload(file, settings)
    document_id = uuid4()
    storage_key = f"documents/{document_id}/original"

    try:
        storage.put(storage_key, file.file, content_type)
    except StorageUnavailableError as error:
        raise HTTPException(status_code=503, detail="Document storage is unavailable.") from error

    document = DocumentRecord(
        id=document_id,
        owner_id=user.id,
        filename=filename,
        content_type=content_type,
        size_bytes=size_bytes,
        storage_key=storage_key,
        status="processing" if content_type == PPTX_CONTENT_TYPE else "uploaded",
        created_at=datetime.now(UTC),
    )
    try:
        session.add(document)
        session.commit()
    except SQLAlchemyError as error:
        session.rollback()
        try:
            storage.delete(storage_key)
        except StorageUnavailableError:
            logger.error("document_upload_cleanup_failed document_id=%s", document_id)
        raise HTTPException(status_code=500, detail="Could not save the document record.") from error

    if content_type == PPTX_CONTENT_TYPE:
        try:
            queue.enqueue_conversion(str(document_id))
        except QueueUnavailableError:
            document.status = "failed"
            document.processing_error = "PPTX conversion could not be queued. You can retry conversion."
            session.commit()

    return document


@router.get("", response_model=list[DocumentRead])
def list_documents(
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
) -> list[DocumentRecord]:
    return list(
        session.scalars(
            select(DocumentRecord)
            .where(DocumentRecord.owner_id == user.id)
            .order_by(DocumentRecord.created_at.desc())
        )
    )


@router.get("/{document_id}", response_model=DocumentRead)
def get_document(
    document_id: str,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
) -> DocumentRecord:
    return _document_or_404(session, document_id, user.id)


@router.get("/{document_id}/download-url", response_model=DownloadUrlRead)
def get_document_download_url(
    document_id: str,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
    storage: DocumentStorage = Depends(get_document_storage),
    settings: Settings = Depends(get_settings),
) -> DownloadUrlRead:
    document = _document_or_404(session, document_id, user.id)
    try:
        url = storage.create_download_url(document.storage_key, settings.object_storage_url_ttl_seconds)
    except StorageUnavailableError as error:
        raise HTTPException(status_code=503, detail="Document storage is unavailable.") from error

    return DownloadUrlRead(
        url=url,
        expires_at=datetime.now(UTC) + timedelta(seconds=settings.object_storage_url_ttl_seconds),
    )


@router.post("/{document_id}/retry-rendition", response_model=DocumentRead)
def retry_document_rendition(
    document_id: str,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
    queue: DocumentQueue = Depends(get_document_queue),
) -> DocumentRecord:
    document = _document_or_404(session, document_id, user.id)
    if document.content_type != PPTX_CONTENT_TYPE or document.status != "failed":
        raise HTTPException(status_code=409, detail="This document is not available for conversion retry.")

    document.status = "processing"
    document.processing_error = None
    session.commit()
    try:
        queue.enqueue_conversion(str(document.id))
    except QueueUnavailableError:
        document.status = "failed"
        document.processing_error = "PPTX conversion could not be queued. You can retry conversion."
        session.commit()
    return document


@router.get("/{document_id}/rendition/download-url", response_model=DownloadUrlRead)
def get_document_rendition_download_url(
    document_id: str,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
    storage: DocumentStorage = Depends(get_document_storage),
    settings: Settings = Depends(get_settings),
) -> DownloadUrlRead:
    document = _document_or_404(session, document_id, user.id)
    if document.status != "ready" or document.rendition_storage_key is None:
        raise HTTPException(status_code=409, detail="The document rendition is not ready.")
    try:
        url = storage.create_download_url(document.rendition_storage_key, settings.object_storage_url_ttl_seconds)
    except StorageUnavailableError as error:
        raise HTTPException(status_code=503, detail="Document storage is unavailable.") from error
    return DownloadUrlRead(
        url=url,
        expires_at=datetime.now(UTC) + timedelta(seconds=settings.object_storage_url_ttl_seconds),
    )
