import httpx

from app.config import get_settings
from app.errors import provider_error
from app.providers.base import ChatMessage, LLMProvider, LLMResult


class OpenAICompatProvider(LLMProvider):
    """Generic OpenAI-compatible chat-completions provider."""

    id = "openai"
    name = "OpenAI-compatible"

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None):
        self._transport = transport  # injectable for tests

    # Subclasses override these to read their own settings.
    def _base(self) -> str:
        return get_settings().openai_compat_api_base

    def _key(self) -> str:
        return get_settings().openai_compat_api_key

    def _model(self) -> str:
        return get_settings().openai_compat_model

    def is_available(self) -> bool:
        return bool(self._base() and self._key() and self._model())

    def models(self) -> list[str]:
        return [self._model()] if self._model() else []

    async def complete(
        self,
        messages: list[ChatMessage],
        *,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> LLMResult:
        url = self._base().rstrip("/") + "/chat/completions"
        payload = {
            "model": model,
            "messages": [m.model_dump() for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {"Authorization": f"Bearer {self._key()}"}
        try:
            async with httpx.AsyncClient(timeout=120, transport=self._transport) as client:
                resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            text = data["choices"][0]["message"]["content"] or ""
        except httpx.HTTPStatusError as e:
            raise provider_error(f"{self.name} returned HTTP {e.response.status_code}.") from e
        except httpx.HTTPError as e:
            raise provider_error(f"{self.name} request failed: {e.__class__.__name__}.") from e
        except (KeyError, IndexError, ValueError, TypeError) as e:
            raise provider_error(f"{self.name} returned an unexpected response.") from e
        return LLMResult(text=text, model=data.get("model", model), usage=data.get("usage"))
