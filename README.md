# Review Assistant (UKP Co-Reasoning)

A web app that helps a reviewer (or an author self-reviewing) write a peer review. Upload a paper PDF,
write a short **judgment** ("The experimental evaluation is a weakness."), and get several **expansion
candidates** grounded in the paper (with citations that are checked against the PDF text). Select the
ones you like and add them to your review draft.

Spec: see `SPEC.md` (v0.1). This repo implements the core of it — see [Scope](#scope).

## Quick start (< 5 minutes, offline with the Mock provider)

Requirements: Python 3.11+, Node 20+.

```bash
# 1. backend  (http://localhost:8000)
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # DEFAULT_PROVIDER=mock works with no credentials
uvicorn app.main:app --reload
```

```bash
# 2. frontend (http://localhost:5173, proxies /api -> :8000)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, upload a PDF, pick a venue, and open the workspace.

## Using the UKP API

Edit `backend/.env` only:

```
DEFAULT_PROVIDER=ukp
UKP_API_BASE=<base url>      # the app calls POST {base}/chat/completions with Bearer auth
UKP_API_KEY=<key>
UKP_MODEL=Qwen3.8-27B        # the exact model id the UKP API expects
```

> The UKP API docs were not available when this was built, so the UKP provider **assumes an
> OpenAI-compatible endpoint**. It is covered by tests against a fake endpoint, but has not been run
> against the real service. If the real API differs, only `backend/app/providers/ukp.py` needs to change.

A provider is "available" only when its env vars are set (Mock is always available). Unavailable
providers show as "Not configured" in the settings popover.

## Adding a provider

1. Create `backend/app/providers/<name>.py` with a class extending `LLMProvider`
   (`id`, `name`, `is_available()`, `models()`, `async complete(...)`). For OpenAI-compatible APIs,
   subclass `OpenAICompatProvider` and override `_base()/_key()/_model()` (see `ukp.py`).
2. Add one line to `backend/app/providers/__init__.py`: `registry.register(YourProvider())`.
3. Add its env vars to `config.py` / `.env.example`.

## Tests

```bash
cd backend  && . .venv/bin/activate && pytest        # 34 tests
cd frontend && npm test && npm run typecheck          # 15 tests
```

## How it works

- **Backend (FastAPI)** owns PDF storage, per-page text extraction (`pypdf`), retrieval (BM25 over
  ~800-char chunks), prompting, provider calls and persistence. The frontend never calls an LLM.
- **Expansion pipeline** (`services/expansion.py`): retrieve context → build a verbalized-sampling
  prompt → call the provider → strip `<think>` and parse JSON (one repair retry) → verify each cited
  quote against the PDF with fuzzy matching (`verified` or "unverified quote" in the UI) → normalize
  probabilities → persist the turn.
- **Storage**: JSON files under `backend/data/` (`uploads/`, `sessions/`), written atomically.
  Both are gitignored.
- **Frontend**: React + TypeScript + Vite, `react-pdf` (text layer on) for the reader, `zustand`
  for state, CSS Modules + tokens (`src/styles/tokens.css`).

### Small additions beyond the spec's API

- `GET /api/providers` also returns `is_default` (matches `DEFAULT_PROVIDER`) so the UI can pick a default.
- `POST .../decision` accepts `reset_ids` to undo a rejection.
- `ReviewItem.source_page` stores the first verified citation page for the "· p. 6" tag.
- The "Max length" setting is the token limit for the **whole response** (per the spec), so very small
  values can truncate the JSON and cause a `parse_error`.

## Scope

Implemented: history sidebar, PDF upload, PDF reader with the right-click selection menu (Req. 1),
provider layer with UKP/Mock/OpenAI-compatible (Req. 2), generation settings (Req. 3), expansion with
multi-select and add-to-review (Req. 7), review editing, Markdown export (copied to clipboard).

Not implemented (extension points are stubbed and named): venue guidelines (Req. 4,
`services/guidelines.py`), input validation (Req. 5, `services/validation.py`), challenging
judgments (Req. 6, `services/challenge.py`), injected-error verification (Req. 8), auth, a database,
PDF/Docx export.
