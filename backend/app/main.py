from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

import app.providers  # noqa: F401  (registers providers)
from app.config import get_settings
from app.errors import AppError, app_error_handler
from app.routers import documents, expand, health, providers, sessions


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Review Assistant API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_exception_handler(AppError, app_error_handler)

    @app.exception_handler(RequestValidationError)
    async def _validation(_, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": str(exc.errors()), "code": "validation_error"})

    for r in (health, providers, documents, sessions, expand):
        app.include_router(r.router, prefix="/api")
    return app


app = create_app()
