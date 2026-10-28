import httpx
import logging
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

import app.dependencies.auth as auth_dependency
from app.config import Settings, get_settings
from app.dependencies.auth import require_authenticated_user
from app.dependencies.ownership import assert_resource_owner
from app.main import app
from app.schemas.auth import AuthUser


def create_document_test_app(document_owner_id: str) -> FastAPI:
    test_app = FastAPI()
    document = {
        "id": "document-1",
        "owner_id": document_owner_id,
        "title": "Private course notes",
    }

    @test_app.get("/api/documents/{document_id}")
    async def get_document(
        document_id: str,
        user: AuthUser = Depends(require_authenticated_user),
    ) -> dict[str, str]:
        if document_id != document["id"]:
            raise HTTPException(status_code=404, detail="Resource not found.")

        assert_resource_owner(document["owner_id"], user)
        return {"id": document["id"], "title": document["title"]}

    return test_app


def test_health_endpoint_reports_ready() -> None:
    response = TestClient(app).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_document_owner_can_read_their_document() -> None:
    test_app = create_document_test_app(document_owner_id="learner-1")
    test_app.dependency_overrides[require_authenticated_user] = lambda: AuthUser(
        id="learner-1",
        name="Riley Learner",
        email="riley@example.com",
    )

    response = TestClient(test_app).get("/api/documents/document-1")

    assert response.status_code == 200
    assert response.json() == {"id": "document-1", "title": "Private course notes"}


def test_another_user_gets_a_generic_not_found_for_the_document() -> None:
    test_app = create_document_test_app(document_owner_id="learner-1")
    test_app.dependency_overrides[require_authenticated_user] = lambda: AuthUser(
        id="learner-2",
        name="Sam Student",
        email="sam@example.com",
    )

    response = TestClient(test_app).get("/api/documents/document-1")

    assert response.status_code == 404
    assert response.json() == {"detail": "Resource not found."}
    assert "Private course notes" not in response.text
    assert "learner-1" not in response.text


def test_document_route_rejects_an_unauthenticated_request() -> None:
    test_app = create_document_test_app(document_owner_id="learner-1")

    response = TestClient(test_app).get("/api/documents/document-1")

    assert response.status_code == 401


def test_me_requires_a_session_cookie() -> None:
    response = TestClient(app).get("/api/me")

    assert response.status_code == 401
    assert response.json() == {
        "message": "Authentication required.",
        "code": "UNAUTHENTICATED",
        "requestId": response.headers["X-Request-ID"],
    }
    assert len(response.headers["X-Request-ID"]) == 36


def test_me_forwards_the_session_cookie_without_logging_it(monkeypatch, caplog) -> None:
    calls: list[tuple[str, dict[str, str]]] = []
    caplog.set_level(logging.INFO, logger="pixielearn.api")
    monkeypatch.setitem(
        app.dependency_overrides,
        get_settings,
        lambda: Settings(
            better_auth_base_url="http://localhost:3001",
            better_auth_cookie_name="better-auth.session_token",
        ),
    )

    class FakeAuthClient:
        def __init__(self, *, timeout: float) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, url: str, headers: dict[str, str]):
            calls.append((url, headers))
            return httpx.Response(
                200,
                json={
                    "user": {
                        "id": "user-42",
                        "name": "Riley Learner",
                        "email": "riley@example.com",
                        "image": "https://example.com/avatar.png",
                    },
                    "session": {"id": "session-7"},
                },
            )

    monkeypatch.setattr(auth_dependency.httpx, "AsyncClient", FakeAuthClient)

    client = TestClient(app)
    client.cookies.set("better-auth.session_token", "session-cookie-value")
    response = client.get("/api/me")

    assert response.status_code == 200
    assert response.json() == {
        "id": "user-42",
        "name": "Riley Learner",
        "email": "riley@example.com",
        "avatarUrl": "https://example.com/avatar.png",
    }
    assert calls == [
        (
            "http://localhost:3001/api/auth/get-session",
            {"Cookie": "better-auth.session_token=session-cookie-value"},
        )
    ]
    assert response.headers["X-Request-ID"] in caplog.text
    assert "session-cookie-value" not in caplog.text


def test_unexpected_errors_return_a_retry_message_and_log_no_request_secrets(caplog) -> None:
    caplog.set_level(logging.INFO, logger="pixielearn.api")

    async def fail_with_sensitive_detail():
        raise RuntimeError("private document text")

    app.add_api_route("/__test__/unexpected-error", fail_with_sensitive_detail)
    try:
        response = TestClient(app, raise_server_exceptions=False).get(
            "/__test__/unexpected-error",
            headers={"Authorization": "Bearer private-token"},
        )
    finally:
        app.router.routes[:] = [
            route
            for route in app.router.routes
            if getattr(route, "endpoint", None) is not fail_with_sensitive_detail
        ]

    request_id = response.headers["X-Request-ID"]
    assert response.status_code == 500
    assert response.json() == {
        "message": "The request failed unexpectedly. Please try again.",
        "code": "INTERNAL_ERROR",
        "requestId": request_id,
    }
    assert request_id in caplog.text
    assert "private document text" not in caplog.text
    assert "private-token" not in caplog.text


def test_me_accepts_a_secure_better_auth_cookie(monkeypatch) -> None:
    monkeypatch.setitem(
        app.dependency_overrides,
        get_settings,
        lambda: Settings(
            better_auth_base_url="http://localhost:3001",
            better_auth_cookie_name="better-auth.session_token",
        ),
    )

    class FakeAuthClient:
        def __init__(self, *, timeout: float) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, _url: str, headers: dict[str, str]):
            assert headers == {"Cookie": "__Secure-better-auth.session_token=secure-value"}
            return httpx.Response(
                200,
                json={"user": {"id": "secure-user", "name": "Sam", "email": "sam@example.com"}},
            )

    monkeypatch.setattr(auth_dependency.httpx, "AsyncClient", FakeAuthClient)

    client = TestClient(app)
    client.cookies.set("__Secure-better-auth.session_token", "secure-value")
    response = client.get("/api/me")

    assert response.status_code == 200
    assert response.json()["id"] == "secure-user"


def test_me_rejects_an_expired_session(monkeypatch) -> None:
    monkeypatch.setitem(
        app.dependency_overrides,
        get_settings,
        lambda: Settings(
            better_auth_base_url="http://localhost:3001",
            better_auth_cookie_name="better-auth.session_token",
        ),
    )

    class FakeAuthClient:
        def __init__(self, *, timeout: float) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, _url: str, headers: dict[str, str]):
            assert headers == {"Cookie": "better-auth.session_token=expired-value"}
            return httpx.Response(401, json=None)

    monkeypatch.setattr(auth_dependency.httpx, "AsyncClient", FakeAuthClient)

    client = TestClient(app)
    client.cookies.set("better-auth.session_token", "expired-value")
    response = client.get("/api/me")

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


def test_me_reports_auth_provider_outages_as_service_unavailable(monkeypatch) -> None:
    monkeypatch.setitem(
        app.dependency_overrides,
        get_settings,
        lambda: Settings(
            better_auth_base_url="http://localhost:3001",
            better_auth_cookie_name="better-auth.session_token",
        ),
    )

    class FakeAuthClient:
        def __init__(self, *, timeout: float) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, _url: str, headers: dict[str, str]):
            assert headers == {"Cookie": "better-auth.session_token=valid-looking-cookie"}
            return httpx.Response(503)

    monkeypatch.setattr(auth_dependency.httpx, "AsyncClient", FakeAuthClient)

    client = TestClient(app)
    client.cookies.set("better-auth.session_token", "valid-looking-cookie")
    response = client.get("/api/me")

    assert response.status_code == 503
    assert response.json() == {
        "message": "Auth provider is unavailable.",
        "code": "REQUEST_FAILED",
        "requestId": response.headers["X-Request-ID"],
    }
