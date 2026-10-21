import logging
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers.health import router as health_router
from app.routers.documents import router as documents_router
from app.routers.users import router as users_router

settings = get_settings()
logger = logging.getLogger("pixielearn.api")

app = FastAPI(title=settings.app_name)


@app.middleware("http")
async def log_request(request: Request, call_next):
    request_id = str(uuid4())
    request.state.request_id = request_id
    started_at = perf_counter()

    try:
        response = await call_next(request)
    except Exception as error:
        response = await unexpected_error_response(request, error)

    response.headers["X-Request-ID"] = request_id
    duration_ms = (perf_counter() - started_at) * 1000
    log_method = logger.warning if response.status_code >= 500 else logger.info
    log_method(
        "request_completed request_id=%s method=%s path=%s status_code=%s duration_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.exception_handler(HTTPException)
async def http_error_response(request: Request, error: HTTPException) -> JSONResponse:
    code = "UNAUTHENTICATED" if error.status_code == 401 else "REQUEST_FAILED"
    message = error.detail if isinstance(error.detail, str) else "The request could not be completed."
    return JSONResponse(
        status_code=error.status_code,
        content={"message": message, "code": code, "requestId": request.state.request_id},
        headers=error.headers,
    )


@app.exception_handler(Exception)
async def unexpected_error_response(request: Request, error: Exception) -> JSONResponse:
    request_id = request.state.request_id
    logger.error(
        "request_unhandled_error request_id=%s method=%s path=%s exception_type=%s",
        request_id,
        request.method,
        request.url.path,
        type(error).__name__,
    )
    return JSONResponse(
        status_code=500,
        content={
            "message": "The request failed unexpectedly. Please try again.",
            "code": "INTERNAL_ERROR",
            "requestId": request_id,
        },
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

app.include_router(health_router)
app.include_router(users_router)
app.include_router(documents_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "pixielearn-api", "status": "ok"}
