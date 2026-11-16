from pydantic import BaseModel


class ValidationResult(BaseModel):
    ok: bool = True
    message: str | None = None


def validate_judgment(text: str) -> ValidationResult:
    """Extension point for Req. 5 (input validation). v0.1 accepts everything."""
    return ValidationResult(ok=True)
