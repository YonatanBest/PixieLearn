import base64
import json

import httpx
import pytest
from pydantic import ValidationError

from app.question_answer import (
    QuestionAnswer,
    QuestionCitation,
    QuestionProviderRequestError,
    QuestionProviderTimeoutError,
)
from app.meta_responses_question_provider import MetaResponsesQuestionProvider
from app.openai_compatible_question_provider import OpenAICompatibleQuestionProvider
from app.schemas.questions import LearningQuestionCreate, QuestionSourceContext, TutorIntent


class FakeResponse:
    def __init__(self, content: str):
        self.content = content

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {"choices": [{"message": {"content": self.content}}]}


def test_provider_sends_question_and_source_to_server_configured_endpoint(monkeypatch) -> None:
    request_data: dict = {}

    def fake_post(url, *, headers, json: dict, timeout):
        request_data.update({"url": url, "headers": headers, "payload": json, "timeout": timeout})
        return FakeResponse(
            '{"answer":"Sunlight is used.","citations":[{"quote":"uses sunlight","span_ids":["span-1"]}]}'
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    provider = OpenAICompatibleQuestionProvider(
        url="https://provider.example.test/v1/chat/completions",
        model="test-model",
        api_key="server-secret",
        timeout=17,
    )

    answer = provider.answer(
        "What does this use?",
        QuestionSourceContext(
            mode="selection",
            page_index=0,
            text="Photosynthesis uses sunlight.",
            span_ids=["span-1"],
        ),
        [{"role": "user", "content": "Earlier question and source."}],
    )

    assert answer == QuestionAnswer(answer="Sunlight is used.", citations=[
        QuestionCitation(quote="uses sunlight", span_ids=["span-1"]),
    ])
    assert request_data["url"] == "https://provider.example.test/v1/chat/completions"
    assert request_data["headers"]["Authorization"] == "Bearer server-secret"
    assert request_data["payload"]["model"] == "test-model"
    assert request_data["payload"]["max_tokens"] == 1_200
    assert json.loads(request_data["payload"]["messages"][-1]["content"]) == {
        "question": "What does this use?",
        "intent": "ask",
        "sourceText": "Photosynthesis uses sunlight.",
        "availableSpanIds": ["span-1"],
    }
    assert request_data["payload"]["response_format"] == {"type": "json_object"}


def test_provider_maps_timeouts_to_recoverable_provider_timeout(monkeypatch) -> None:
    def fake_post(*_args, **_kwargs):
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr(httpx, "post", fake_post)
    provider = OpenAICompatibleQuestionProvider(
        url="https://provider.example.test/v1/chat/completions",
        model="test-model",
        api_key=None,
        timeout=1,
    )

    with pytest.raises(QuestionProviderTimeoutError):
        provider.answer(
            "Question",
            QuestionSourceContext(mode="page", page_index=0, text="Source text."),
            [],
        )


def test_provider_rejects_malformed_model_output(monkeypatch) -> None:
    monkeypatch.setattr(httpx, "post", lambda *_args, **_kwargs: FakeResponse("not json"))
    provider = OpenAICompatibleQuestionProvider(
        url="http://localhost:9000/v1/chat/completions",
        model="test-model",
        api_key=None,
        timeout=1,
    )

    with pytest.raises(QuestionProviderRequestError):
        provider.answer(
            "Question",
            QuestionSourceContext(mode="page", page_index=0, text="Source text."),
            [],
        )


def test_meta_provider_parses_json_output_and_preserves_source_context(monkeypatch) -> None:
    request_data: dict = {}

    class MetaResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {
                "output_text": json.dumps(
                    {
                        "answer": "Photosynthesis uses sunlight.",
                        "citations": [{"quote": "uses sunlight", "spanIds": ["span-1"]}],
                        "actions": [{"type": "pdf_highlight", "quote": "uses sunlight", "spanIds": ["span-1"]}],
                    }
                )
            }

    def fake_post(url, *, headers, json: dict, timeout):
        request_data.update({"url": url, "headers": headers, "payload": json, "timeout": timeout})
        return MetaResponse()

    monkeypatch.setattr(httpx, "post", fake_post)
    provider = MetaResponsesQuestionProvider(api_key="server-secret", model="muse-spark-1.3", timeout=12)

    answer = provider.answer(
        "What does this use?",
        QuestionSourceContext(mode="selection", page_index=0, text="Photosynthesis uses sunlight.", span_ids=["span-1"]),
        [],
        intent="quiz",
    )

    assert answer.answer == "Photosynthesis uses sunlight."
    assert answer.actions[0].type == "pdf_highlight"
    assert request_data["url"] == "https://api.meta.ai/v1/responses"
    assert request_data["headers"]["Authorization"].startswith("Bearer ")
    assert request_data["payload"]["model"] == "muse-spark-1.3"
    assert request_data["payload"]["input"][-1]["content"][0]["type"] == "input_text"
    assert json.loads(request_data["payload"]["input"][-1]["content"][0]["text"]) == {
        "question": "What does this use?",
        "intent": "quiz",
        "sourceText": "Photosynthesis uses sunlight.",
        "availableSpanIds": ["span-1"],
        "visualContext": None,
    }
    assert "multiple-choice comprehension check" in request_data["payload"]["instructions"]


def test_meta_provider_sends_board_image_as_an_image_block(monkeypatch) -> None:
    request_data: dict = {}

    class MetaResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {
                "output_text": (
                    '{"answer":"The drawing points toward sunlight.","citations":'
                    '[{"quote":"uses sunlight","spanIds":["span-1"]}]}'
                )
            }

    def fake_post(_url, *, headers, json: dict, timeout):
        request_data.update(json)
        return MetaResponse()

    monkeypatch.setattr(httpx, "post", fake_post)
    provider = MetaResponsesQuestionProvider(api_key="server-secret", model="muse-spark-1.3", timeout=1)
    image = "data:image/jpeg;base64,/9j/c3ludGhldGlj"

    provider.answer(
        "What does my drawing show?",
        QuestionSourceContext(mode="page", page_index=0, text="Photosynthesis uses sunlight.", span_ids=["span-1"]),
        [],
        whiteboard_image=image,
    )

    content = request_data["input"][-1]["content"]
    assert content[1] == {"type": "input_image", "image_url": image}
    assert json.loads(content[0]["text"])["visualContext"] == "A snapshot of the learner's current whiteboard follows."


def test_openai_compatible_provider_sends_board_image_as_an_image_url(monkeypatch) -> None:
    request_data: dict = {}

    def fake_post(_url, *, headers, json: dict, timeout):
        request_data.update(json)
        return FakeResponse(
            '{"answer":"The source discusses sunlight.","citations":[{"quote":"uses sunlight","span_ids":["span-1"]}]}'
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    provider = OpenAICompatibleQuestionProvider(
        url="https://provider.example.test/v1/chat/completions",
        model="test-model",
        api_key=None,
        timeout=1,
    )
    image = "data:image/jpeg;base64,/9j/c3ludGhldGlj"

    provider.answer(
        "What does my drawing show?",
        QuestionSourceContext(mode="page", page_index=0, text="Photosynthesis uses sunlight.", span_ids=["span-1"]),
        [],
        whiteboard_image=image,
    )

    content = request_data["messages"][-1]["content"]
    assert content[1] == {"type": "image_url", "image_url": {"url": image}}
    assert "do not treat them as verified source evidence" in request_data["messages"][0]["content"]


def test_learning_question_rejects_whiteboard_images_over_one_mib() -> None:
    image = "data:image/jpeg;base64," + base64.b64encode(
        b"\xff\xd8\xff" + b"\x00" * 1_048_576,
    ).decode("ascii")

    with pytest.raises(ValidationError, match="between 1 byte and 1 MiB"):
        LearningQuestionCreate(
            question="What does this drawing show?",
            page_index=0,
            whiteboard_image=image,
        )


@pytest.mark.parametrize(
    ("intent", "expected_instruction"),
    [
        ("repeat", "Restate the explanation"),
        ("simpler", "more simply"),
        ("deeper", "more detailed explanation"),
        ("quiz", "multiple-choice comprehension check"),
    ],
)
def test_openai_compatible_provider_uses_provider_neutral_tutor_intent(
    monkeypatch,
    intent: TutorIntent,
    expected_instruction: str,
) -> None:
    request_data: dict = {}

    def fake_post(_url, *, headers, json: dict, timeout):
        request_data.update(json)
        return FakeResponse(
            '{"answer":"The source says sunlight is used.","citations":[{"quote":"uses sunlight","span_ids":["span-1"]}]}'
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    provider = OpenAICompatibleQuestionProvider(
        url="https://provider.example.test/v1/chat/completions",
        model="test-model",
        api_key=None,
        timeout=1,
    )

    provider.answer(
        "Use the same page.",
        QuestionSourceContext(
            mode="selection",
            page_index=0,
            text="Photosynthesis uses sunlight.",
            span_ids=["span-1"],
        ),
        [],
        intent=intent,
    )

    assert expected_instruction in request_data["messages"][0]["content"]
    assert json.loads(request_data["messages"][-1]["content"])["intent"] == intent


def test_meta_provider_maps_timeouts_to_recoverable_provider_timeout(monkeypatch) -> None:
    provider = MetaResponsesQuestionProvider(api_key="server-secret", model="muse-spark-1.3", timeout=1)

    def fake_post(*_args, **_kwargs):
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(QuestionProviderTimeoutError):
        provider.answer("Question", QuestionSourceContext(mode="page", page_index=0, text="Source text."), [])

def test_meta_provider_rejects_malformed_model_output(monkeypatch) -> None:
    provider = MetaResponsesQuestionProvider(api_key="server-secret", model="muse-spark-1.3", timeout=1)

    class MalformedResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"output_text": "not json"}

    monkeypatch.setattr(
        httpx,
        "post",
        lambda *_args, **_kwargs: MalformedResponse(),
    )
    with pytest.raises(QuestionProviderRequestError):
        provider.answer("Question", QuestionSourceContext(mode="page", page_index=0, text="Source text."), [])
