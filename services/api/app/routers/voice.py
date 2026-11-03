import base64
import binascii
import json
import logging
import wave
from io import BytesIO
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.dependencies.auth import require_authenticated_user
from app.learning_context import get_document_for_learning_context
from app.models import LearningQuestionRecord
from app.schemas.auth import AuthUser
from app.schemas.questions import LearningQuestionAudioTranscript

logger = logging.getLogger("pixielearn.api.voice")
router = APIRouter(prefix="/api/documents", tags=["learning voice"])

MAX_AUDIO_BYTES = 25 * 1024 * 1024


def _owned_document(session: Session, document_id: str, owner_id: str) -> UUID:
    try:
        parsed_id = UUID(document_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Document not found.") from error
    document = get_document_for_learning_context(session, parsed_id, owner_id)
    return document.id


def _validate_wav(audio: bytes) -> None:
    try:
        with wave.open(BytesIO(audio), "rb") as wav:
            valid_format = (
                wav.getcomptype() == "NONE"
                and wav.getnchannels() == 1
                and wav.getsampwidth() == 2
                and wav.getframerate() == 24_000
            )
            if not valid_format or wav.getnframes() <= 0:
                raise HTTPException(
                    status_code=422,
                    detail="Voice questions must be non-empty mono 24 kHz PCM WAV audio.",
                )
            if len(audio) > MAX_AUDIO_BYTES:
                raise HTTPException(status_code=413, detail="Voice recording must be 5 MiB or smaller.")
    except (wave.Error, EOFError) as error:
        raise HTTPException(status_code=422, detail="The voice recording is not a valid WAV file.") from error


@router.post("/{document_id}/voice/transcribe", response_model=LearningQuestionAudioTranscript)
def transcribe_learning_question(
    document_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
    user: AuthUser = Depends(require_authenticated_user),
    settings: Settings = Depends(get_settings),
) -> LearningQuestionAudioTranscript:
    document_id = _owned_document(session, document_id, user.id)
    if not settings.meta_model_api_key:
        raise HTTPException(status_code=503, detail="Voice questions are not configured on this server.")
    audio = file.file.read(MAX_AUDIO_BYTES + 1)
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Voice recording must be 25 MiB or smaller.")
    _validate_wav(audio)
    try:
        response = httpx.post(
            "https://api.meta.ai/v1/asr/transcribe",
            headers={"Authorization": f"Bearer {settings.meta_model_api_key}"},
            data={
                "request": json.dumps(
                    {
                        "mode": "PUSH_TO_TALK",
                        "model": "muse-voice-transcribe-1.0",
                        "audioEncoding": "WAV",
                    }
                )
            },
            files={"audio": ("voice-question.wav", audio, "audio/wav")},
            timeout=settings.ai_request_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("The transcription response was malformed.")
        transcript = payload.get("transcript")
        if not isinstance(transcript, str) or not transcript.strip() or len(transcript) > 4_000:
            raise ValueError("The transcription response did not contain text.")
        return LearningQuestionAudioTranscript(transcript=transcript.strip())
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="Voice transcription timed out. Try again.") from error
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
        logger.warning("voice_transcription_failed document_id=%s error_type=%s", document_id, type(error).__name__)
        raise HTTPException(status_code=502, detail="The recording could not be transcribed. Try again.") from error


@router.get("/{document_id}/questions/{question_id}/audio")
def synthesize_learning_answer(
    document_id: str,
    question_id: str,
    session: Session = Depends(get_db),
    user: AuthUser = Depends(require_authenticated_user),
    settings: Settings = Depends(get_settings),
) -> Response:
    owned_document_id = _owned_document(session, document_id, user.id)
    try:
        parsed_question_id = UUID(question_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Question not found.") from error
    question = session.scalar(
        select(LearningQuestionRecord).where(
            LearningQuestionRecord.id == parsed_question_id,
            LearningQuestionRecord.document_id == owned_document_id,
            LearningQuestionRecord.owner_id == user.id,
            LearningQuestionRecord.status == "complete",
        )
    )
    if question is None or not question.answer:
        raise HTTPException(status_code=404, detail="Question not found.")
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="Tutor speech is not configured on this server.")
    try:
        response = httpx.post(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            headers={"x-goog-api-key": settings.gemini_api_key},
            json={
                "model": settings.gemini_tts_model,
                "input": [
                    {
                        "type": "user_input",
                        "content": [{"type": "text", "text": question.answer[:4_000]}],
                    }
                ],
                "response_format": {"type": "audio"},
                "generation_config": {"speech_config": [{"voice": "Kore"}]},
            },
            timeout=settings.ai_request_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("The speech response was malformed.")
        steps = payload.get("steps", [])
        if not isinstance(steps, list):
            raise ValueError("The speech response steps were malformed.")
        audio = next(
            (
                block["data"]
                for step in steps
                if isinstance(step, dict)
                if step.get("type") == "model_output"
                for block in step.get("content", [])
                if isinstance(block, dict)
                if block.get("type") == "audio" and isinstance(block.get("data"), str)
            ),
            None,
        )
        if audio is None:
            raise ValueError("The speech response did not contain audio.")
        audio_bytes = base64.b64decode(audio, validate=True)
        if not audio_bytes.startswith(b"RIFF") or audio_bytes[8:12] != b"WAVE":
            raise ValueError("The speech response did not contain WAV audio.")
        return Response(content=audio_bytes, media_type="audio/wav")
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="Tutor speech timed out. Try again.") from error
    except (httpx.HTTPError, KeyError, TypeError, ValueError, binascii.Error) as error:
        logger.warning("answer_speech_failed question_id=%s error_type=%s", question.id, type(error).__name__)
        raise HTTPException(status_code=502, detail="Tutor speech could not be generated. Try again.") from error
