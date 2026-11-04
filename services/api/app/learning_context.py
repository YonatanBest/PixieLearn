import re
import unicodedata
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DocumentPageRecord, DocumentRecord
from app.schemas.questions import QuestionSourceContext

MAX_PAGE_CONTEXT_CHARS = 12_000


def normalize_source_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = re.sub(r"[\u2018\u2019\u201a\u201b]", "'", normalized)
    normalized = re.sub(r"[\u201c\u201d\u201e\u201f]", '"', normalized)
    normalized = re.sub(r"[\u2010-\u2015\u2212]", "-", normalized)
    return re.sub(r"\s+", " ", normalized).strip().casefold()


def resolve_learning_context(
    session: Session,
    document: DocumentRecord,
    page_index: int,
    selected_text: str | None = None,
    selected_span_ids: list[str] | None = None,
) -> QuestionSourceContext:
    span_ids = selected_span_ids or []
    if page_index < 0 or document.page_count is None or page_index >= document.page_count:
        raise HTTPException(status_code=422, detail="The selected page is outside this document.")
    page = session.scalar(
        select(DocumentPageRecord).where(
            DocumentPageRecord.document_id == document.id,
            DocumentPageRecord.page_index == page_index,
        )
    )
    if page is None:
        raise HTTPException(status_code=409, detail="Text for this page is not available yet.")
    page_text = page.text.strip()
    if not page_text:
        raise HTTPException(status_code=409, detail="No readable text is available for this page.")

    if selected_text is None:
        if span_ids:
            raise HTTPException(status_code=422, detail="Selection spans require selected text.")
        return QuestionSourceContext(
            mode="page",
            page_index=page_index,
            text=page_text[:MAX_PAGE_CONTEXT_CHARS],
            span_ids=[span["id"] for span in page.spans[:500]],
        )

    selection = selected_text.strip()
    normalized_selection = normalize_source_text(selection)
    normalized_page_text = normalize_source_text(page_text)
    valid_span_ids = {span["id"] for span in page.spans}
    if any(span_id not in valid_span_ids for span_id in span_ids):
        raise HTTPException(status_code=422, detail="The selected text does not belong to this page.")
    selected_spans = set(span_ids)
    span_text = " ".join(span["text"] for span in page.spans if span["id"] in selected_spans)
    normalized_spans = normalize_source_text(span_text)
    if span_ids and normalized_selection not in normalized_spans:
        raise HTTPException(
            status_code=422,
            detail="The selected text does not match the selected page spans.",
        )
    if not normalized_selection or (
        normalized_selection not in normalized_page_text
        and (not normalized_spans or normalized_selection not in normalized_spans)
    ):
        raise HTTPException(
            status_code=422,
            detail="The selected text could not be verified against this page.",
        )
    return QuestionSourceContext(
        mode="selection",
        page_index=page_index,
        text=selection[:MAX_PAGE_CONTEXT_CHARS],
        span_ids=span_ids,
    )


def get_document_for_learning_context(
    session: Session,
    document_id: UUID,
    owner_id: str,
) -> DocumentRecord:
    document = session.scalar(
        select(DocumentRecord).where(
            DocumentRecord.id == document_id,
            DocumentRecord.owner_id == owner_id,
        )
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    if document.status != "ready" or document.page_count is None:
        raise HTTPException(status_code=409, detail="Document content is not ready for questions.")
    return document
