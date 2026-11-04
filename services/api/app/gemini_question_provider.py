import json
import logging
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.question_answer import (
    INTENT_INSTRUCTIONS,
    QuestionAnswer,
    QuestionAnswerProvider,
    QuestionProviderRequestError,
    QuestionProviderTimeoutError,
)
from app.schemas.questions import QuestionSourceContext, TutorIntent

logger = logging.getLogger("pixielearn.api.gemini_provider")


class GeminiQuestionProvider:
    def __init__(self, *, api_key: str, model: str = "gemini-2.5-flash", timeout: float = 30.0) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def answer(
        self,
        question: str,
        source: QuestionSourceContext,
        history: list[dict[str, str]],
        *,
        intent: TutorIntent = "ask",
        whiteboard_image: str | None = None,
    ) -> QuestionAnswer:
        contents: list[dict[str, Any]] = []

        for item in history:
            role = "model" if item["role"] == "assistant" else "user"
            contents.append({
                "role": role,
                "parts": [{"text": item["content"]}],
            })

        user_payload = {
            "question": question,
            "intent": intent,
            "sourceText": source.text,
            "availableSpanIds": source.span_ids,
        }

        user_parts: list[dict[str, Any]] = [{"text": json.dumps(user_payload, ensure_ascii=False)}]

        if whiteboard_image:
            try:
                header, base64_data = whiteboard_image.split(",", 1)
                mime_type = header.split(";")[0].replace("data:", "")
                user_parts.append({
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": base64_data,
                    }
                })
            except Exception as error:
                logger.warning("Failed to parse whiteboard image for Gemini: %s", error)

        contents.append({
            "role": "user",
            "parts": user_parts,
        })

        system_instruction = (
            "You are a source-grounded learning tutor. "
            f"{INTENT_INSTRUCTIONS[intent]} Answer using only the supplied sourceText. "
            "Keep answers concise and helpful (under 300 words). "
            "You MUST include at least one citation in citations with verbatim quote from sourceText "
            "and matching spanIds from availableSpanIds. "
            "When a whiteboard image is provided, discuss observable marks, distinguish what matches "
            "the source from uncertainty, and ask for clarification when ambiguous; do not treat "
            "learner marks as verified source evidence. "
            "Return JSON matching: answer (string), citations (list of objects with quote and spanIds), "
            "and actions (list of objects with type pdf_highlight, whiteboard_label, or quiz, or []). "
            "For a quiz action, provide question, options (list of strings), correctIndex (integer), and explanation. "
            "Do not invent unrequested action types."
        )

        request_body = {
            "system_instruction": {"parts": [{"text": system_instruction}]},
            "contents": contents,
            "generationConfig": {
                "response_mime_type": "application/json",
                "max_output_tokens": 8192,
            },
        }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"

        try:
            response = httpx.post(url, json=request_body, timeout=self.timeout)
            response.raise_for_status()
            payload = response.json()
            candidates = payload.get("candidates", [])
            if not candidates:
                raise ValueError("No candidates returned from Gemini.")
            first_candidate = candidates[0]
            parts = first_candidate.get("content", {}).get("parts", [])
            if not parts or "text" not in parts[0]:
                raise ValueError("Malformed candidate output from Gemini.")
            json_text = parts[0]["text"]
            return QuestionAnswer.model_validate_json(json_text)
        except httpx.TimeoutException as error:
            raise QuestionProviderTimeoutError from error
        except (
            httpx.HTTPError,
            IndexError,
            KeyError,
            TypeError,
            ValueError,
            ValidationError,
        ) as error:
            logger.exception("Gemini question provider failed: %s", error)
            raise QuestionProviderRequestError from error


def create_gemini_question_answer_provider(settings: Settings) -> QuestionAnswerProvider | None:
    if settings.gemini_api_key:
        return GeminiQuestionProvider(
            api_key=settings.gemini_api_key,
            timeout=settings.ai_request_timeout_seconds,
        )
    return None
