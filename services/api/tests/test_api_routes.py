import httpx
import logging
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.dependencies.auth as auth_dependency
from app.config import Settings, get_settings
from app.dependencies.auth import require_authenticated_user
from app.dependencies.ownership import assert_resource_owner
from app.document_queue import QueueUnavailableError, get_document_queue
from app.database import Base, get_db
from app.main import app
from app.models import DocumentPageRecord, DocumentRecord
from app.schemas.auth import AuthUser
from app.storage import get_document_storage


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


class MemoryDocumentStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.download_requests: list[tuple[str, int]] = []

    def put(self, key: str, body, content_type: str) -> None:
        self.objects[key] = body.read()

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)

    def download(self, key: str, destination) -> None:
        destination.write(self.objects[key])

    def create_download_url(self, key: str, expires_in: int) -> str:
        self.download_requests.append((key, expires_in))
        return f"https://storage.example.test/{key}?expires={expires_in}"


class MemoryDocumentQueue:
    def __init__(self) -> None:
        self.document_ids: list[str] = []
        self.unavailable = False

    def enqueue_processing(self, document_id: str) -> None:
        if self.unavailable:
            raise QueueUnavailableError
        self.document_ids.append(document_id)


@pytest.fixture
def document_api(monkeypatch, request):
    max_upload_size = getattr(request, "param", 104_857_600)
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(test_engine)
    test_sessions = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    storage = MemoryDocumentStorage()
    queue = MemoryDocumentQueue()

    def provide_test_session():
        with test_sessions() as session:
            yield session

    monkeypatch.setitem(app.dependency_overrides, get_db, provide_test_session)
    monkeypatch.setitem(app.dependency_overrides, get_document_storage, lambda: storage)
    monkeypatch.setitem(app.dependency_overrides, get_document_queue, lambda: queue)
    monkeypatch.setitem(
        app.dependency_overrides,
        require_authenticated_user,
        lambda: AuthUser(id="learner-1", name="Riley Learner", email="riley@example.com"),
    )
    monkeypatch.setitem(
        app.dependency_overrides,
        get_settings,
        lambda: Settings(document_max_size_bytes=max_upload_size, object_storage_url_ttl_seconds=300),
    )
    with TestClient(app) as client:
        yield client, storage, test_sessions
    test_engine.dispose()


def test_authenticated_learner_uploads_a_private_pdf(document_api) -> None:
    client, storage, _sessions = document_api
    private_notes = b"%PDF-1.7\nprivate notes\n%%EOF"

    response = client.post(
        "/api/documents",
        files={"file": ("lecture.pdf", private_notes, "application/pdf")},
    )

    assert response.status_code == 201
    assert response.json()["filename"] == "lecture.pdf"
    assert response.json()["contentType"] == "application/pdf"
    assert response.json()["sizeBytes"] == len(private_notes)
    assert response.json()["status"] == "processing"
    queue = app.dependency_overrides[get_document_queue]()
    assert queue.document_ids == [response.json()["id"]]
    assert list(storage.objects.values()) == [private_notes]


def test_authenticated_learner_uploads_a_structurally_valid_pptx(document_api) -> None:
    from io import BytesIO
    from zipfile import ZipFile

    client, _storage, _sessions = document_api
    presentation = BytesIO()
    with ZipFile(presentation, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr("ppt/presentation.xml", "<presentation />")

    response = client.post(
        "/api/documents",
        files={"file": ("slides.pptx", presentation.getvalue(), "application/octet-stream")},
    )

    assert response.status_code == 201
    assert response.json()["contentType"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    assert response.json()["status"] == "processing"
    queue = app.dependency_overrides[get_document_queue]()
    assert queue.document_ids == [response.json()["id"]]


def test_pptx_upload_shows_retryable_failure_when_redis_is_unavailable(document_api) -> None:
    from io import BytesIO
    from zipfile import ZipFile

    client, _storage, _sessions = document_api
    queue = app.dependency_overrides[get_document_queue]()
    queue.unavailable = True
    presentation = BytesIO()
    with ZipFile(presentation, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr("ppt/presentation.xml", "<presentation />")

    response = client.post(
        "/api/documents",
        files={"file": ("slides.pptx", presentation.getvalue(), "application/octet-stream")},
    )

    assert response.status_code == 201
    assert response.json()["status"] == "failed"
    assert response.json()["processingError"] == "Document processing could not be queued. You can retry processing."


def test_owner_can_retry_a_failed_pptx_through_legacy_rendition_route(document_api) -> None:
    client, _storage, sessions = document_api
    queue = app.dependency_overrides[get_document_queue]()
    document_id = uuid4()
    with sessions() as session:
        session.add(
            DocumentRecord(
                id=document_id,
                owner_id="learner-1",
                filename="slides.pptx",
                content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                size_bytes=12,
                storage_key=f"documents/{document_id}/original",
                status="failed",
                processing_error="Document conversion failed. You can retry processing.",
                created_at=datetime.now(UTC),
            )
        )
        session.commit()

    response = client.post(f"/api/documents/{document_id}/retry-rendition")

    assert response.status_code == 200
    assert response.json()["status"] == "processing"
    assert response.json()["processingError"] is None
    assert queue.document_ids == [str(document_id)]


def test_owner_can_retry_a_failed_pdf_processing_job(document_api) -> None:
    client, _storage, sessions = document_api
    queue = app.dependency_overrides[get_document_queue]()
    document_id = uuid4()
    with sessions() as session:
        session.add(
            DocumentRecord(
                id=document_id,
                owner_id="learner-1",
                filename="scan.pdf",
                content_type="application/pdf",
                size_bytes=12,
                storage_key=f"documents/{document_id}/original",
                status="failed",
                processing_error="Document text extraction failed. You can retry processing.",
                created_at=datetime.now(UTC),
            )
        )
        session.commit()

    response = client.post(f"/api/documents/{document_id}/retry-processing")

    assert response.status_code == 200
    assert response.json()["status"] == "processing"
    assert response.json()["processingError"] is None
    assert queue.document_ids == [str(document_id)]


def test_rendition_download_url_requires_a_ready_owner_document(document_api) -> None:
    client, storage, sessions = document_api
    document_id = uuid4()
    with sessions() as session:
        session.add(
            DocumentRecord(
                id=document_id,
                owner_id="learner-1",
                filename="slides.pptx",
                content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                size_bytes=12,
                storage_key=f"documents/{document_id}/original",
                rendition_storage_key=f"documents/{document_id}/rendition.pdf",
                page_count=3,
                status="ready",
                created_at=datetime.now(UTC),
            )
        )
        session.commit()

    response = client.get(f"/api/documents/{document_id}/rendition/download-url")

    assert response.status_code == 200
    assert response.json()["url"] == f"https://storage.example.test/documents/{document_id}/rendition.pdf?expires=300"
    assert storage.download_requests == [(f"documents/{document_id}/rendition.pdf", 300)]


def test_rendition_download_url_hides_another_owners_document(document_api, monkeypatch) -> None:
    client, storage, sessions = document_api
    document_id = uuid4()
    with sessions() as session:
        session.add(
            DocumentRecord(
                id=document_id,
                owner_id="learner-1",
                filename="slides.pptx",
                content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                size_bytes=12,
                storage_key=f"documents/{document_id}/original",
                rendition_storage_key=f"documents/{document_id}/rendition.pdf",
                page_count=3,
                status="ready",
                created_at=datetime.now(UTC),
            )
        )
        session.commit()
    monkeypatch.setitem(
        app.dependency_overrides,
        require_authenticated_user,
        lambda: AuthUser(id="learner-2", name="Morgan Learner", email="morgan@example.com"),
    )

    response = client.get(f"/api/documents/{document_id}/rendition/download-url")

    assert response.status_code == 404
    assert response.json()["message"] == "Document not found."
    assert storage.download_requests == []


def test_upload_rejects_an_unsupported_file_type(document_api) -> None:
    client, storage, _sessions = document_api

    response = client.post("/api/documents", files={"file": ("notes.txt", b"notes", "text/plain")})

    assert response.status_code == 415
    assert response.json()["message"] == "Only PDF and PPTX files are supported."
    assert storage.objects == {}


def test_upload_rejects_malformed_pdf_content(document_api) -> None:
    client, storage, _sessions = document_api

    response = client.post("/api/documents", files={"file": ("fake.pdf", b"%PDF-1.7\ntruncated", "application/pdf")})

    assert response.status_code == 422
    assert response.json()["message"] == "The selected file is not a valid PDF."
    assert storage.objects == {}


def test_upload_rejects_a_malformed_pptx_archive(document_api) -> None:
    from io import BytesIO
    from zipfile import ZipFile

    client, storage, _sessions = document_api
    presentation = BytesIO()
    with ZipFile(presentation, "w") as archive:
        archive.writestr("[Content_Types].xml", "not XML")
        archive.writestr("ppt/presentation.xml", "<presentation />")

    response = client.post(
        "/api/documents",
        files={"file": ("broken.pptx", presentation.getvalue(), "application/octet-stream")},
    )

    assert response.status_code == 422
    assert response.json()["message"] == "The selected file is not a valid PPTX presentation."
    assert storage.objects == {}


@pytest.mark.parametrize("document_api", [1024 * 1024], indirect=True)
def test_upload_rejects_files_over_the_configured_limit(document_api) -> None:
    client, storage, _sessions = document_api

    response = client.post(
        "/api/documents",
        files={"file": ("large.pdf", b"%PDF-1.7" + b"x" * (1024 * 1024), "application/pdf")},
    )

    assert response.status_code == 413
    assert response.json()["message"] == "Files must be 1 MiB or smaller."
    assert storage.objects == {}


def test_upload_removes_the_object_when_database_persistence_fails(document_api, monkeypatch) -> None:
    client, storage, _sessions = document_api

    def fail_commit(_session):
        raise SQLAlchemyError("database unavailable")

    monkeypatch.setattr(Session, "commit", fail_commit)
    response = client.post(
        "/api/documents",
        files={"file": ("lecture.pdf", b"%PDF-1.7\nprivate notes\n%%EOF", "application/pdf")},
    )

    assert response.status_code == 500
    assert response.json()["message"] == "Could not save the document record."
    assert storage.objects == {}


def test_document_listing_returns_only_the_authenticated_owners_files(document_api) -> None:
    client, _storage, sessions = document_api
    with sessions() as session:
        session.add_all([
            DocumentRecord(
                id=uuid4(), owner_id="learner-1", filename="my.pdf", content_type="application/pdf",
                size_bytes=10, storage_key="documents/one/original", status="uploaded", created_at=datetime.now(UTC),
            ),
            DocumentRecord(
                id=uuid4(), owner_id="learner-2", filename="private.pdf", content_type="application/pdf",
                size_bytes=10, storage_key="documents/two/original", status="uploaded", created_at=datetime.now(UTC),
            ),
        ])
        session.commit()

    response = client.get("/api/documents")

    assert response.status_code == 200
    assert [document["filename"] for document in response.json()] == ["my.pdf"]


def test_document_details_and_download_urls_are_owner_only(document_api, monkeypatch) -> None:
    client, storage, sessions = document_api
    document_id = uuid4()
    storage_key = f"documents/{document_id}/original"
    with sessions() as session:
        session.add(
            DocumentRecord(
                id=document_id,
                owner_id="learner-1",
                filename="my.pdf",
                content_type="application/pdf",
                size_bytes=10,
                storage_key=storage_key,
                status="uploaded",
                created_at=datetime.now(UTC),
            )
        )
        session.commit()

    detail_response = client.get(f"/api/documents/{document_id}")
    download_response = client.get(f"/api/documents/{document_id}/download-url")

    assert detail_response.status_code == 200
    assert detail_response.json()["filename"] == "my.pdf"
    assert download_response.status_code == 200
    assert download_response.json()["url"] == f"https://storage.example.test/{storage_key}?expires=300"
    assert storage.download_requests == [(storage_key, 300)]

    monkeypatch.setitem(
        app.dependency_overrides,
        require_authenticated_user,
        lambda: AuthUser(id="learner-2", name="Sam Student", email="sam@example.com"),
    )
    other_user_response = client.get(f"/api/documents/{document_id}")
    other_user_download_response = client.get(f"/api/documents/{document_id}/download-url")

    assert other_user_response.status_code == 404
    assert other_user_response.json()["message"] == "Document not found."
    assert other_user_download_response.status_code == 404
    assert storage.download_requests == [(storage_key, 300)]


def test_document_routes_reject_unauthenticated_requests(document_api, monkeypatch) -> None:
    client, _storage, _sessions = document_api
    monkeypatch.delitem(app.dependency_overrides, require_authenticated_user)

    response = client.get("/api/documents")

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


def test_page_text_returns_owner_scoped_normalized_spans(document_api) -> None:
    client, _storage, sessions = document_api
    document_id = uuid4()
    with sessions() as session:
        session.add(
            DocumentRecord(
                id=document_id,
                owner_id="learner-1",
                filename="lecture.pdf",
                content_type="application/pdf",
                size_bytes=12,
                storage_key=f"documents/{document_id}/original",
                status="ready",
                page_count=1,
                created_at=datetime.now(UTC),
            )
        )
        session.add(
            DocumentPageRecord(
                document_id=document_id,
                page_index=0,
                page_width=612,
                page_height=792,
                text="Pixie learns",
                spans=[
                    {
                        "id": "p00000-w00000",
                        "text": "Pixie",
                        "source": "native",
                        "bbox": {"x": 0.1, "y": 0.2, "width": 0.2, "height": 0.03},
                        "confidence": None,
                    }
                ],
                used_ocr=False,
                extractor_version="1",
            )
        )
        session.commit()

    response = client.get(f"/api/documents/{document_id}/pages/0/text")

    assert response.status_code == 200
    assert response.json() == {
        "pageIndex": 0,
        "pageWidth": 612,
        "pageHeight": 792,
        "text": "Pixie learns",
        "usedOcr": False,
        "spans": [
            {
                "id": "p00000-w00000",
                "text": "Pixie",
                "source": "native",
                "bbox": {"x": 0.1, "y": 0.2, "width": 0.2, "height": 0.03},
                "confidence": None,
                "lineIndex": None,
            }
        ],
    }


def test_page_text_hides_other_owners_document(document_api, monkeypatch) -> None:
    client, _storage, sessions = document_api
    document_id = uuid4()
    with sessions() as session:
        session.add(
            DocumentRecord(
                id=document_id,
                owner_id="learner-1",
                filename="private.pdf",
                content_type="application/pdf",
                size_bytes=12,
                storage_key=f"documents/{document_id}/original",
                status="ready",
                page_count=1,
                created_at=datetime.now(UTC),
            )
        )
        session.commit()
    monkeypatch.setitem(
        app.dependency_overrides,
        require_authenticated_user,
        lambda: AuthUser(id="learner-2", name="Sam Student", email="sam@example.com"),
    )

    response = client.get(f"/api/documents/{document_id}/pages/0/text")

    assert response.status_code == 404
    assert response.json()["message"] == "Document not found."


def test_page_text_is_unavailable_while_document_is_processing(document_api) -> None:
    client, _storage, sessions = document_api
    document_id = uuid4()
    with sessions() as session:
        session.add(
            DocumentRecord(
                id=document_id,
                owner_id="learner-1",
                filename="scan.pdf",
                content_type="application/pdf",
                size_bytes=12,
                storage_key=f"documents/{document_id}/original",
                status="processing",
                created_at=datetime.now(UTC),
            )
        )
        session.commit()

    response = client.get(f"/api/documents/{document_id}/pages/0/text")

    assert response.status_code == 409


def test_page_text_returns_not_found_for_an_out_of_range_page(document_api) -> None:
    client, _storage, sessions = document_api
    document_id = uuid4()
    with sessions() as session:
        session.add(
            DocumentRecord(
                id=document_id,
                owner_id="learner-1",
                filename="lecture.pdf",
                content_type="application/pdf",
                size_bytes=12,
                storage_key=f"documents/{document_id}/original",
                status="ready",
                page_count=1,
                created_at=datetime.now(UTC),
            )
        )
        session.commit()

    response = client.get(f"/api/documents/{document_id}/pages/1/text")

    assert response.status_code == 404


def test_page_text_requires_authentication(document_api, monkeypatch) -> None:
    client, _storage, _sessions = document_api
    monkeypatch.delitem(app.dependency_overrides, require_authenticated_user)

    response = client.get(f"/api/documents/{uuid4()}/pages/0/text")

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


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
