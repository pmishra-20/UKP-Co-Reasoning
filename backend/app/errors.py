from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, status: int, code: str, detail: str):
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail


def provider_unavailable(detail: str) -> AppError:
    return AppError(400, "provider_unavailable", detail)


def provider_error(detail: str) -> AppError:
    return AppError(502, "provider_error", detail)


def parse_error(detail: str) -> AppError:
    return AppError(502, "parse_error", detail)


def not_found(detail: str) -> AppError:
    return AppError(404, "not_found", detail)


def invalid_file(detail: str) -> AppError:
    return AppError(415, "invalid_file", detail)


def file_too_large(detail: str) -> AppError:
    return AppError(413, "file_too_large", detail)


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"detail": exc.detail, "code": exc.code})
