import json

import pytest

from app.errors import AppError
from app.models import ExpandRequest, GenerationParams
from app.providers import registry
from app.providers.base import LLMProvider, LLMResult
from app.services import expansion
from app.services.expansion import extract_json_object, parse_output, strip_think


def expand(client, sid, **kw):
    body = {"judgment": "The experimental evaluation is a weakness.", "provider_id": "mock", **kw}
    return client.post(f"/api/sessions/{sid}/expand", json=body)


def test_expand_returns_n_candidates_normalized(client, session_id):
    r = expand(client, session_id)
    assert r.status_code == 200
    t = r.json()
    assert len(t["candidates"]) == 3
    assert [c["label"] for c in t["candidates"]] == ["A", "B", "C"]
    assert abs(sum(c["probability"] for c in t["candidates"]) - 1.0) < 1e-6
    probs = [c["probability"] for c in t["candidates"]]
    assert probs == sorted(probs, reverse=True)
    # persisted
    s = client.get(f"/api/sessions/{session_id}").json()
    assert len(s["turns"]) == 1
    assert client.get("/api/sessions").json()[0]["num_turns"] == 1


def test_mock_quotes_are_verified(client, session_id):
    t = expand(client, session_id).json()
    for c in t["candidates"]:
        assert all(e["verified"] for e in c["evidence"])
        assert all(e["page"] in (1, 2) for e in c["evidence"])


def test_num_candidates_5(client, session_id):
    t = expand(client, session_id, params={"num_candidates": 5}).json()
    assert len(t["candidates"]) == 5


def test_invalid_params_422(client, session_id):
    assert expand(client, session_id, params={"temperature": 9}).status_code == 422
    assert expand(client, session_id, params={"num_candidates": 1}).status_code == 422
    assert expand(client, session_id, judgment="hi").status_code == 422


def test_unavailable_provider_400(client, session_id):
    r = expand(client, session_id, provider_id="ukp")
    assert r.status_code == 400 and r.json()["code"] == "provider_unavailable"


def test_attachments_used_and_in_prompt(client, session_id):
    att = [{"id": "a1", "kind": "evidence", "text": "single random seed", "page": 2}]
    t = expand(client, session_id, attachments=att).json()
    assert t["attachments"][0]["text"] == "single random seed"


def test_verbosity_changes_prompt():
    from datetime import datetime, timezone
    from app.models import DocumentMeta, Session

    now = datetime.now(timezone.utc)
    s = Session(id="x", title="t", document=DocumentMeta(id="d", filename="f", num_pages=1, uploaded_at=now),
                venue="ARR", role="reviewer", created_at=now, updated_at=now)
    out = {}
    for v in ("concise", "balanced", "detailed"):
        req = ExpandRequest(judgment="weak eval", provider_id="mock", params=GenerationParams(verbosity=v))
        out[v] = expansion.build_messages(s, req, [{"page": 1, "text": "hello"}])[0].content
    assert "1-2 sentences" in out["concise"]
    assert "2-4 sentences" in out["balanced"]
    assert "one paragraph" in out["detailed"]


def test_fabricated_quote_unverified(client, session_id):
    class Fab(LLMProvider):
        id = "fab"; name = "fab"
        def is_available(self): return True
        def models(self): return ["f"]
        async def complete(self, messages, *, model, temperature, max_tokens):
            return LLMResult(model=model, text=json.dumps({"candidates": [
                {"angle": "A real one", "text": "t1", "probability": 0.5,
                 "evidence": [{"quote": "We compare against temperature scaling, deep ensembles and MC dropout.", "page": 99}]},
                {"angle": "A fake one", "text": "t2", "probability": 0.5,
                 "evidence": [{"quote": "The authors report a 47% improvement on a dataset called ZetaBench.", "page": 1}]},
            ]}))

    registry.register(Fab())
    t = expand(client, session_id, provider_id="fab").json()
    ev = {e["quote"][:12]: e for c in t["candidates"] for e in c["evidence"]}
    assert ev["We compare a"]["verified"] is True and ev["We compare a"]["page"] == 2  # page corrected
    assert ev["The authors "]["verified"] is False


def test_verify_handles_hyphenation_and_case():
    pages = [(1, expansion.normalize("the evalu-\nation is very small-scale"))]
    assert expansion.verify_quote("The evaluation is very SMALL-scale", pages)[0]


def test_parse_strips_think_and_fences():
    payload = {"candidates": [{"angle": "a", "text": "t", "probability": 1, "evidence": []}]}
    raw = "<think>reasoning with {braces} inside</think>\nSure! Here you go:\n```json\n" + json.dumps(payload) + "\n```\nHope it helps."
    assert parse_output(raw).candidates[0].text == "t"
    assert strip_think("<think>x</think>y") == "y"
    assert extract_json_object('prefix {"a": "}"} suffix') == '{"a": "}"}'


def test_parse_failure_raises():
    with pytest.raises(ValueError):
        parse_output("no json here")


def test_repair_retry_then_success_and_failure(client, session_id):
    calls = {"n": 0}
    good = json.dumps({"candidates": [{"angle": "x", "text": "t", "probability": 1, "evidence": []},
                                      {"angle": "y", "text": "u", "probability": 1, "evidence": []}]})

    class Flaky(LLMProvider):
        id = "flaky"; name = "flaky"
        def is_available(self): return True
        def models(self): return ["f"]
        async def complete(self, messages, *, model, temperature, max_tokens):
            calls["n"] += 1
            return LLMResult(model=model, text="garbage" if calls["n"] == 1 else good)

    class Broken(Flaky):
        id = "broken"
        async def complete(self, messages, *, model, temperature, max_tokens):
            calls["n"] += 1
            return LLMResult(model=model, text="still garbage")

    registry.register(Flaky()); registry.register(Broken())
    r = expand(client, session_id, provider_id="flaky")
    assert r.status_code == 200 and calls["n"] == 2
    calls["n"] = 0
    r = expand(client, session_id, provider_id="broken")
    assert r.status_code == 502 and r.json()["code"] == "parse_error" and calls["n"] == 2


def test_decision_adds_to_review(client, session_id):
    t = expand(client, session_id).json()
    ids = [c["id"] for c in t["candidates"]]
    r = client.post(f"/api/sessions/{session_id}/turns/{t['id']}/decision",
                    json={"selected_ids": ids[:2], "rejected_ids": [ids[2]], "add_to_review": True})
    assert r.status_code == 200
    s = r.json()
    assert len(s["review"]) == 2 and all(i["section"] == "weaknesses" for i in s["review"])
    st = {c["id"]: c["status"] for c in s["turns"][0]["candidates"]}
    assert st[ids[0]] == st[ids[1]] == "accepted" and st[ids[2]] == "rejected"
    assert s["review"][0]["source_page"] in (1, 2)
    # idempotent: accepting again does not duplicate
    s2 = client.post(f"/api/sessions/{session_id}/turns/{t['id']}/decision",
                     json={"selected_ids": ids[:2], "add_to_review": True}).json()
    assert len(s2["review"]) == 2
    assert client.post(f"/api/sessions/{session_id}/turns/nope/decision", json={}).status_code == 404


def test_put_review(client, session_id):
    t = expand(client, session_id).json()
    s = client.post(f"/api/sessions/{session_id}/turns/{t['id']}/decision",
                    json={"selected_ids": [t["candidates"][0]["id"]], "add_to_review": True}).json()
    item = s["review"][0]; item["text"] = "edited"
    r = client.put(f"/api/sessions/{session_id}/review", json={"items": [item]})
    assert r.json()["review"][0]["text"] == "edited"
    assert client.put(f"/api/sessions/{session_id}/review", json={"items": []}).json()["review"] == []


def test_retrieval_picks_relevant_chunk():
    from app.services.retrieval import chunk_pages, top_chunks
    pages = [{"page": 1, "text": "alpha beta gamma " * 100}, {"page": 2, "text": "zebra quagga okapi " * 100}]
    top = top_chunks(chunk_pages(pages), "zebra okapi", k=1)
    assert top[0]["page"] == 2


def test_reject_and_undo(client, session_id):
    t = expand(client, session_id).json()
    cid = t["candidates"][0]["id"]
    url = f"/api/sessions/{session_id}/turns/{t['id']}/decision"
    s = client.post(url, json={"rejected_ids": [cid]}).json()
    assert s["turns"][0]["candidates"][0]["status"] == "rejected"
    s = client.post(url, json={"reset_ids": [cid]}).json()
    assert s["turns"][0]["candidates"][0]["status"] == "pending"
    assert s["review"] == []


def test_default_provider_flag(client):
    by_id = {p["id"]: p for p in client.get("/api/providers").json()}
    assert by_id["mock"]["is_default"] is True and by_id["ukp"]["is_default"] is False


def test_ukp_provider_end_to_end_with_fake_endpoint(client, session_id, monkeypatch):
    """UKP path (OpenAI-compatible wire format, <think> output) against a fake HTTP endpoint."""
    import httpx

    from app.config import get_settings

    monkeypatch.setenv("UKP_API_BASE", "http://ukp.test/v1")
    monkeypatch.setenv("UKP_API_KEY", "secret")
    get_settings.cache_clear()
    seen = {}

    def handler(request: httpx.Request):
        body = json.loads(request.content)
        seen.update(url=str(request.url), auth=request.headers["authorization"], body=body)
        payload = {"candidates": [
            {"angle": "Single seed", "text": "Only one seed is used.", "probability": 0.6,
             "evidence": [{"quote": "All experiments use a single random seed for each benchmark.", "page": 2}]},
            {"angle": "Baselines", "text": "Key baseline missing.", "probability": 0.4,
             "evidence": [{"quote": "a quote that is not in the paper at all", "page": 1}]},
        ]}
        content = "<think>let me think {about} it</think>\n```json\n" + json.dumps(payload) + "\n```"
        return httpx.Response(200, json={"model": "Qwen3.8-27B", "choices": [{"message": {"content": content}}]})

    ukp = registry.get("ukp")
    monkeypatch.setattr(ukp, "_transport", httpx.MockTransport(handler))
    r = expand(client, session_id, provider_id="ukp", params={"temperature": 0.3, "verbosity": "detailed"})
    assert r.status_code == 200, r.text
    assert seen["url"] == "http://ukp.test/v1/chat/completions" and seen["auth"] == "Bearer secret"
    assert seen["body"]["model"] == "Qwen3.8-27B"
    assert seen["body"]["temperature"] == 0.3 and seen["body"]["max_tokens"] == 1600
    t = r.json()
    assert t["provider_id"] == "ukp" and len(t["candidates"]) == 2
    ev = [e for c in t["candidates"] for e in c["evidence"]]
    assert [e["verified"] for e in ev] == [True, False]
    get_settings.cache_clear()
