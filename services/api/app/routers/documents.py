import logging
import re
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import PurePath
from uuid import UUID, uuid4
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.dependencies.auth import require_authenticated_user
from app.document_queue import DocumentQueue, QueueUnavailableError, get_document_queue
from app.models import DocumentLearningStateRecord, DocumentPageRecord, DocumentRecord
from app.schemas.auth import AuthUser
from app.schemas.documents import (
    DocumentLearningStateRead,
    DocumentLearningStateWrite,
    DocumentPageTextRead,
    DocumentRead,
    DownloadUrlRead,
    LearningProgressRead,
    WorkspaceState,
)
from app.storage import DocumentStorage, StorageUnavailableError, get_document_storage

logger = logging.getLogger("pixielearn.api.documents")
router = APIRouter(prefix="/api/documents", tags=["documents"])

PDF_CONTENT_TYPE = "application/pdf"
PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
SINGLE_BYTE_RANGE = re.compile(r"bytes=(\d*)-(\d*)")


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
        status="processing",
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

    try:
        queue.enqueue_processing(str(document_id))
    except QueueUnavailableError:
        document.status = "failed"
        document.processing_error = "Document processing could not be queued. You can retry processing."
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


@router.get("/learning-progress", response_model=list[LearningProgressRead])
def list_learning_progress(
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
) -> list[LearningProgressRead]:
    records = session.execute(
        select(DocumentLearningStateRecord, DocumentRecord.page_count)
        .join(DocumentRecord, DocumentRecord.id == DocumentLearningStateRecord.document_id)
        .where(DocumentRecord.owner_id == user.id, DocumentRecord.status == "ready")
        .order_by(DocumentLearningStateRecord.last_opened_at.desc())
    )
    return [
        LearningProgressRead(
            document_id=record.document_id,
            page_index=record.page_index,
            page_count=page_count,
            zoom=record.zoom,
            last_opened_at=record.last_opened_at,
        )
        for record, page_count in records
        if page_count is not None
    ]


@router.get(
    "/{document_id}/learning-state",
    response_model=DocumentLearningStateRead,
)
def get_document_learning_state(
    document_id: str,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
) -> DocumentLearningStateRead:
    document = _document_or_404(session, document_id, user.id)
    if document.status != "ready" or document.page_count is None:
        raise HTTPException(status_code=409, detail="Document learning state is not available yet.")
    saved = session.get(DocumentLearningStateRecord, document.id)
    if saved is None:
        return DocumentLearningStateRead(
            document_id=document.id,
            page_index=0,
            page_count=document.page_count,
            zoom=84,
            last_opened_at=document.created_at,
            has_saved_state=False,
            workspace_state=WorkspaceState(),
        )
    return DocumentLearningStateRead(
        document_id=saved.document_id,
        page_index=min(saved.page_index, document.page_count - 1),
        page_count=document.page_count,
        zoom=saved.zoom,
        last_opened_at=saved.last_opened_at,
        has_saved_state=True,
        workspace_state=WorkspaceState.model_validate(saved.workspace_state),
    )


@router.put(
    "/{document_id}/learning-state",
    response_model=DocumentLearningStateRead,
)
def save_document_learning_state(
    document_id: str,
    payload: DocumentLearningStateWrite,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
) -> DocumentLearningStateRead:
    document = _document_or_404(session, document_id, user.id)
    if document.status != "ready" or document.page_count is None:
        raise HTTPException(status_code=409, detail="Document learning state is not available yet.")
    if payload.page_index >= document.page_count:
        raise HTTPException(status_code=422, detail="The saved page is outside this document.")

    now = datetime.now(UTC)
    saved = session.get(DocumentLearningStateRecord, document.id)
    if saved is None:
        saved = DocumentLearningStateRecord(document_id=document.id)
        session.add(saved)
    saved.page_index = payload.page_index
    saved.zoom = payload.zoom
    saved.workspace_state = payload.workspace_state.model_dump(mode="json", by_alias=True)
    saved.last_opened_at = now
    try:
        session.commit()
    except SQLAlchemyError as error:
        session.rollback()
        raise HTTPException(status_code=500, detail="Could not save document learning state.") from error

    return DocumentLearningStateRead(
        document_id=saved.document_id,
        page_index=saved.page_index,
        page_count=document.page_count,
        zoom=saved.zoom,
        last_opened_at=saved.last_opened_at,
        has_saved_state=True,
        workspace_state=WorkspaceState.model_validate(saved.workspace_state),
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


@router.get("/{document_id}/learning-pdf")
def get_learning_pdf(
    document_id: str,
    request: Request,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
    storage: DocumentStorage = Depends(get_document_storage),
) -> Response:
    document = _document_or_404(session, document_id, user.id)
    if document.status != "ready":
        raise HTTPException(status_code=409, detail="Document processing is not complete.")
    pdf_key = document.rendition_storage_key if document.content_type == PPTX_CONTENT_TYPE else document.storage_key
    if not pdf_key:
        raise HTTPException(status_code=409, detail="The PDF rendition is not available.")

    range_header = request.headers.get("range")
    if range_header:
        try:
            file_size = storage.get_size(pdf_key)
        except StorageUnavailableError as error:
            raise HTTPException(status_code=503, detail="Document storage is unavailable.") from error

        match = SINGLE_BYTE_RANGE.fullmatch(range_header.strip())
        if not match or file_size <= 0:
            return Response(
                status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
                headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"},
            )

        first, last = match.groups()
        if not first and not last:
            return Response(
                status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
                headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"},
            )
        if first:
            start = int(first)
            end = min(int(last), file_size - 1) if last else file_size - 1
        else:
            suffix_length = int(last)
            if suffix_length <= 0:
                return Response(
                    status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
                    headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"},
                )
            start = max(0, file_size - suffix_length)
            end = file_size - 1

        if start >= file_size or end < start:
            return Response(
                status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
                headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"},
            )

        try:
            content, actual_size = storage.get_range(pdf_key, start, end)
        except StorageUnavailableError as error:
            raise HTTPException(status_code=503, detail="Document storage is unavailable.") from error
        if actual_size != file_size or len(content) != end - start + 1:
            raise HTTPException(status_code=502, detail="Document storage returned an incomplete PDF range.")
        return Response(
            content=content,
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            media_type=PDF_CONTENT_TYPE,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(content)),
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Disposition": f"inline; filename*=UTF-8''{quote(document.filename)}",
                "Cache-Control": "private, no-store",
            },
        )

    content = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode="w+b")
    try:
        storage.download(pdf_key, content)
    except StorageUnavailableError as error:
        content.close()
        raise HTTPException(status_code=503, detail="Document storage is unavailable.") from error
    content_length = content.tell()
    content.seek(0)

    def stream_content():
        try:
            while chunk := content.read(64 * 1024):
                yield chunk
        finally:
            content.close()

    return StreamingResponse(
        stream_content(),
        media_type=PDF_CONTENT_TYPE,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(document.filename)}",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: str,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
    storage: DocumentStorage = Depends(get_document_storage),
) -> Response:
    document = _document_or_404(session, document_id, user.id)
    document.status = "deleting"
    storage_keys = {document.storage_key}
    if document.rendition_storage_key:
        storage_keys.add(document.rendition_storage_key)
    session.commit()

    try:
        for storage_key in storage_keys:
            storage.delete(storage_key)
    except StorageUnavailableError as error:
        logger.error("document_delete_storage_failed document_id=%s", document.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document cleanup is incomplete. Retry deletion.",
        ) from error

    session.execute(
        delete(DocumentLearningStateRecord).where(
            DocumentLearningStateRecord.document_id == document.id,
        )
    )
    session.execute(delete(DocumentPageRecord).where(DocumentPageRecord.document_id == document.id))
    session.execute(
        delete(DocumentRecord).where(
            DocumentRecord.id == document.id,
            DocumentRecord.owner_id == user.id,
            DocumentRecord.status == "deleting",
        )
    )
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _queue_document_processing(document: DocumentRecord, session: Session, queue: DocumentQueue) -> DocumentRecord:
    if document.status != "failed":
        raise HTTPException(status_code=409, detail="This document is not available for processing retry.")

    document.status = "processing"
    document.processing_error = None
    session.commit()
    try:
        queue.enqueue_processing(str(document.id))
    except QueueUnavailableError:
        document.status = "failed"
        document.processing_error = "Document processing could not be queued. You can retry processing."
        session.commit()
    return document


@router.post("/{document_id}/retry-processing", response_model=DocumentRead)
def retry_document_processing(
    document_id: str,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
    queue: DocumentQueue = Depends(get_document_queue),
) -> DocumentRecord:
    document = _document_or_404(session, document_id, user.id)
    return _queue_document_processing(document, session, queue)


@router.post("/{document_id}/retry-rendition", response_model=DocumentRead, include_in_schema=False)
def retry_document_rendition(
    document_id: str,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
    queue: DocumentQueue = Depends(get_document_queue),
) -> DocumentRecord:
    document = _document_or_404(session, document_id, user.id)
    if document.content_type != PPTX_CONTENT_TYPE:
        raise HTTPException(status_code=409, detail="This document is not a presentation.")
    return _queue_document_processing(document, session, queue)


@router.get("/{document_id}/pages/{page_index}/text", response_model=DocumentPageTextRead)
def get_document_page_text(
    document_id: str,
    page_index: int,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
) -> DocumentPageRecord:
    document = _document_or_404(session, document_id, user.id)
    if document.status != "ready":
        raise HTTPException(status_code=409, detail="Document page text is not ready.")
    page = session.scalar(
        select(DocumentPageRecord).where(
            DocumentPageRecord.document_id == document.id,
            DocumentPageRecord.page_index == page_index,
        )
    )
    if page is None:
        raise HTTPException(status_code=404, detail="Document page not found.")
    return page


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
