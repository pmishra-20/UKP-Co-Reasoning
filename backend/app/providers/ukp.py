from app.config import get_settings
from app.providers.openai_compat import OpenAICompatProvider


class UKPProvider(OpenAICompatProvider):
    """UKP inference API. Assumed OpenAI-compatible; if not, only this file changes."""

    id = "ukp"
    name = "UKP inference API"

    def _base(self) -> str:
        return get_settings().ukp_api_base

    def _key(self) -> str:
        return get_settings().ukp_api_key

    def _model(self) -> str:
        return get_settings().ukp_model

    def is_available(self) -> bool:
        return bool(self._base() and self._key())
