from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers.health import router as health_router
from app.routers.users import router as users_router

settings = get_settings()

app = FastAPI(title=settings.app_name)


@app.exception_handler(HTTPException)
async def http_error_response(_request: Request, error: HTTPException) -> JSONResponse:
    code = "UNAUTHENTICATED" if error.status_code == 401 else "REQUEST_FAILED"
    message = error.detail if isinstance(error.detail, str) else "The request could not be completed."
    return JSONResponse(
        status_code=error.status_code,
        content={"message": message, "code": code},
        headers=error.headers,
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(users_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "pixielearn-api", "status": "ok"}
