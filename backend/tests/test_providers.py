import httpx
import pytest

from app.errors import AppError
from app.providers import registry
from app.providers.base import ChatMessage
from app.providers.mock import MockProvider
from app.providers.openai_compat import OpenAICompatProvider
from app.providers.ukp import UKPProvider


def test_mock_always_available():
    assert MockProvider().is_available()


def test_ukp_unavailable_when_env_empty(monkeypatch):
    from app.config import get_settings

    for k in ("UKP_API_BASE", "UKP_API_KEY"):
        monkeypatch.setenv(k, "")
    get_settings.cache_clear()
    assert not UKPProvider().is_available()
    monkeypatch.setenv("UKP_API_BASE", "http://x/v1")
    monkeypatch.setenv("UKP_API_KEY", "k")
    get_settings.cache_clear()
    assert UKPProvider().is_available()
    get_settings.cache_clear()


def test_registry_raises_on_unknown_id():
    with pytest.raises(AppError) as e:
        registry.get("nope")
    assert e.value.code == "provider_unavailable" and e.value.status == 400


def test_registry_lists_providers():
    ids = {p.id for p in registry.list_all()}
    assert {"mock", "ukp", "openai"} <= ids


class _P(OpenAICompatProvider):
    def _base(self): return "http://llm.test/v1"
    def _key(self): return "k"
    def _model(self): return "m"


async def test_openai_compat_maps_500_to_provider_error():
    p = _P(transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
    with pytest.raises(AppError) as e:
        await p.complete([ChatMessage(role="user", content="hi")], model="m", temperature=0.5, max_tokens=10)
    assert e.value.code == "provider_error" and e.value.status == 502


async def test_openai_compat_success_and_request_shape():
    seen = {}

    def handler(req: httpx.Request):
        seen["url"] = str(req.url)
        seen["auth"] = req.headers["authorization"]
        return httpx.Response(200, json={"model": "m", "choices": [{"message": {"content": "hello"}}]})

    p = _P(transport=httpx.MockTransport(handler))
    r = await p.complete([ChatMessage(role="user", content="hi")], model="m", temperature=0.5, max_tokens=10)
    assert r.text == "hello"
    assert seen == {"url": "http://llm.test/v1/chat/completions", "auth": "Bearer k"}


async def test_openai_compat_maps_network_error():
    def handler(req):
        raise httpx.ConnectError("down")

    p = _P(transport=httpx.MockTransport(handler))
    with pytest.raises(AppError) as e:
        await p.complete([ChatMessage(role="user", content="hi")], model="m", temperature=0.5, max_tokens=10)
    assert e.value.code == "provider_error"


def test_providers_endpoint(client):
    r = client.get("/api/providers")
    assert r.status_code == 200
    by_id = {p["id"]: p for p in r.json()}
    assert by_id["mock"]["available"] is True and by_id["mock"]["default_model"] == "mock-echo"
    assert by_id["ukp"]["available"] is False
