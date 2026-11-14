from app.errors import provider_unavailable
from app.providers.base import LLMProvider

_providers: dict[str, LLMProvider] = {}


def register(provider: LLMProvider) -> None:
    _providers[provider.id] = provider


def get(provider_id: str) -> LLMProvider:
    p = _providers.get(provider_id)
    if p is None or not p.is_available():
        raise provider_unavailable(f"Provider '{provider_id}' is unknown or not configured.")
    return p


def list_all() -> list[LLMProvider]:
    return list(_providers.values())
