import json
import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.dependencies.auth import require_authenticated_user
from app.models import DocumentRecord, LearningQuestionRecord
from app.learning_context import (
    get_document_for_learning_context,
    normalize_source_text,
    resolve_learning_context,
)
from app.openai_compatible_question_provider import create_question_answer_provider
from app.question_answer import (
    QuestionAnswer,
    QuestionAnswerProvider,
    QuestionProviderRequestError,
    QuestionProviderTimeoutError,
    QuestionProviderUnavailableError,
)
from app.schemas.auth import AuthUser
from app.schemas.questions import (
    LearningQuestionCitation,
    LearningQuestionCreate,
    LearningQuestionList,
    LearningQuestionRead,
    PdfHighlightAction,
    QuestionSourceContext,
)

logger = logging.getLogger("pixielearn.api.questions")
router = APIRouter(prefix="/api/documents", tags=["learning questions"])

HISTORY_TURNS = 8


def get_question_provider(
    settings: Settings = Depends(get_settings),
) -> QuestionAnswerProvider | None:
    return create_question_answer_provider(settings)


def _owned_document(session: Session, document_id: str, owner_id: str) -> DocumentRecord:
    try:
        parsed_id = UUID(document_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Document not found.") from error
    return get_document_for_learning_context(session, parsed_id, owner_id)


def _conversation_history(session: Session, document_id: UUID, owner_id: str) -> list[dict[str, str]]:
    records = list(
        session.scalars(
            select(LearningQuestionRecord)
            .where(
                LearningQuestionRecord.document_id == document_id,
                LearningQuestionRecord.owner_id == owner_id,
                LearningQuestionRecord.status == "complete",
            )
            .order_by(LearningQuestionRecord.created_at.desc(), LearningQuestionRecord.id.desc())
            .limit(HISTORY_TURNS)
        )
    )
    history: list[dict[str, str]] = []
    for record in reversed(records):
        source = QuestionSourceContext.model_validate(record.source_context)
        history.extend(
            [
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "question": record.question,
                            "sourceContext": {
                                "mode": source.mode,
                                "pageIndex": source.page_index,
                                "text": source.text[:2_000],
                            },
                        },
                        ensure_ascii=False,
                    ),
                },
                {
                    "role": "assistant",
                    "content": record.answer or "",
                },
            ]
        )
    return history


def _validate_answer(answer: QuestionAnswer, source: QuestionSourceContext) -> list[dict]:
    normalized_source = normalize_source_text(source.text)
    allowed_span_ids = set(source.span_ids)
    validated: list[dict] = []
    for citation in answer.citations:
        normalized_quote = normalize_source_text(citation.quote)
        if not normalized_quote or normalized_quote not in normalized_source:
            raise QuestionProviderRequestError("The provider returned an unsupported source citation.")
        if any(span_id not in allowed_span_ids for span_id in citation.span_ids):
            raise QuestionProviderRequestError("The provider returned an unsupported source span.")
        validated.append(
            LearningQuestionCitation(
                page_index=source.page_index,
                quote=citation.quote,
                span_ids=citation.span_ids,
            ).model_dump(mode="json", by_alias=True)
        )
    return validated


def _validate_actions(answer: QuestionAnswer, source: QuestionSourceContext) -> list[dict]:
    normalized_source = normalize_source_text(source.text)
    allowed_span_ids = set(source.span_ids)
    validated: list[dict] = []
    for action in answer.actions:
        if action.type == "pdf_highlight":
            normalized_quote = normalize_source_text(action.quote)
            if not normalized_quote or normalized_quote not in normalized_source:
                raise QuestionProviderRequestError("The provider returned an unsupported PDF highlight.")
            if any(span_id not in allowed_span_ids for span_id in action.span_ids):
                raise QuestionProviderRequestError("The provider returned an unsupported PDF highlight span.")
            validated.append(
                PdfHighlightAction(
                    page_index=source.page_index,
                    quote=action.quote,
                    span_ids=action.span_ids,
                ).model_dump(mode="json", by_alias=True)
            )
        elif action.type == "whiteboard_label":
            normalized_label = normalize_source_text(action.text)
            if not normalized_label or normalized_label not in normalized_source:
                raise QuestionProviderRequestError("The provider returned an unsupported whiteboard label.")
            validated.append(action.model_dump(mode="json", by_alias=True))
    return validated


@router.get("/{document_id}/questions", response_model=LearningQuestionList)
def list_learning_questions(
    document_id: str,
    limit: int = Query(default=100, ge=1, le=100),
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
) -> LearningQuestionList:
    document = _owned_document(session, document_id, user.id)
    records = list(
        session.scalars(
            select(LearningQuestionRecord)
            .where(
                LearningQuestionRecord.document_id == document.id,
                LearningQuestionRecord.owner_id == user.id,
            )
            .order_by(LearningQuestionRecord.created_at.desc(), LearningQuestionRecord.id.desc())
            .limit(limit)
        )
    )
    records.reverse()
    return LearningQuestionList(
        questions=[LearningQuestionRead.model_validate(record, from_attributes=True) for record in records]
    )


@router.post(
    "/{document_id}/questions",
    response_model=LearningQuestionRead,
    status_code=201,
)
def ask_learning_question(
    document_id: str,
    payload: LearningQuestionCreate,
    user: AuthUser = Depends(require_authenticated_user),
    session: Session = Depends(get_db),
    provider: QuestionAnswerProvider | None = Depends(get_question_provider),
) -> LearningQuestionRead:
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Enter a question before sending.")
    document = _owned_document(session, document_id, user.id)
    source = resolve_learning_context(
        session,
        document,
        payload.page_index,
        selected_text=payload.selected_text,
        selected_span_ids=payload.selected_span_ids,
    )
    record = LearningQuestionRecord(
        id=uuid4(),
        document_id=document.id,
        owner_id=user.id,
        question=question,
        answer=None,
        source_context=source.model_dump(mode="json", by_alias=True),
        citations=[],
        actions=[],
        status="pending",
        created_at=datetime.now(UTC),
    )
    session.add(record)
    try:
        session.commit()
    except SQLAlchemyError as error:
        session.rollback()
        raise HTTPException(status_code=500, detail="The question could not be saved.") from error

    try:
        if provider is None:
            raise QuestionProviderUnavailableError
        history = _conversation_history(session, document.id, user.id)
        session.commit()
        answer = provider.answer(
            question,
            source,
            history,
            intent=payload.intent,
            whiteboard_image=payload.whiteboard_image,
        )
        citations = _validate_answer(answer, source)
        actions = _validate_actions(answer, source)
        record.answer = answer.answer
        record.citations = citations
        record.actions = actions
        record.status = "complete"
        record.failure_message = None
        session.commit()
        session.refresh(record)
    except QuestionProviderTimeoutError as error:
        record.status = "failed"
        record.failure_message = "Pixie did not respond in time. Try again."
        session.commit()
        raise HTTPException(status_code=504, detail=record.failure_message) from error
    except QuestionProviderUnavailableError as error:
        record.status = "failed"
        record.failure_message = "Tutor questions are not configured on this server."
        session.commit()
        raise HTTPException(status_code=503, detail=record.failure_message) from error
    except QuestionProviderRequestError as error:
        record.status = "failed"
        record.failure_message = "Pixie could not answer this question. Try again."
        session.commit()
        raise HTTPException(status_code=502, detail=record.failure_message) from error
    except SQLAlchemyError as error:
        session.rollback()
        logger.exception("question_answer_persistence_failed document_id=%s", document.id)
        raise HTTPException(status_code=500, detail="Pixie's answer could not be saved.") from error

    return LearningQuestionRead.model_validate(record, from_attributes=True)
