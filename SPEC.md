# Review Assistant — Starter Build Spec (v0.1)

> **How to use this file:** put it in an empty repo as `SPEC.md`, open Claude Code there, and say:
> *"Read SPEC.md and implement it milestone by milestone. After each milestone, run the checks listed under it before moving on. Do not implement anything listed under Out of scope."*

---

## 0. Product summary

A web app that helps a reviewer (or an author self-reviewing) write a peer review. The user uploads a paper PDF, writes a short **judgment** (e.g. *"The experimental evaluation is a weakness."*), and the system returns **several expansion candidates** that elaborate and support that judgment using evidence from the paper. The user can select several candidates, reject them, and add the selected ones to a review draft.

### In scope for v0.1
1. Main review page: collapsible **chat-history sidebar**, **PDF reader**, **interaction panel** (review output + judgment expansion + composer).
2. **PDF upload** (new-review screen).
3. **Core expansion**: judgment → N grounded candidates, using verbalized sampling.
4. **Req. 1 — Rich PDF interactions**: select text → right-click → custom context menu (add as evidence, insert as snippet, start judgment from selection, highlight, copy).
5. **Req. 2 — Multiple API providers**: pluggable provider layer; UKP (Qwen3.8-27B) first, a Mock provider for offline dev, and an OpenAI-compatible provider stub.
6. **Req. 3 — Model parameter controls**: verbosity, number of candidates, temperature (diversity), max length.
7. Multi-select of candidates and adding them to a review section (this is Req. 7 in the brief; it falls out of the core UI so it is included).

### Out of scope (do NOT build yet)
- Login, accounts, auth.
- A database. Use the JSON-file store in §4.4.
- Req. 4 venue guidelines in prompts (keep the `venue` field and a `guidelines` hook only — see §4.6).
- Req. 5 input validation, Req. 6 challenging judgments, Req. 8 injected-error verification. Leave the extension points named in §4.6.
- Export to PDF/Docx (the *Export review* button copies Markdown to clipboard for now).

---

## 1. Tech stack (fixed)

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript, Vite |
| Styling | Plain CSS with CSS custom properties (`src/styles/tokens.css`) + CSS Modules per component. No Tailwind, no UI kit. |
| PDF | `react-pdf` (pdf.js) with **text layer enabled** (required for selection). Configure the pdf.js worker exactly as the react-pdf README for the installed version says. |
| State | `zustand` |
| Icons | `lucide-react` |
| Frontend tests | `vitest` + `@testing-library/react` |
| Backend | Python 3.11+, FastAPI, Uvicorn, Pydantic v2, `pydantic-settings` |
| HTTP client | `httpx` (async) |
| PDF text | `pypdf` (per-page text extraction) |
| Retrieval | `rank-bm25` (select relevant page chunks for the prompt) |
| Fuzzy match | `rapidfuzz` (verify that cited quotes exist in the paper) |
| Uploads | `python-multipart` |
| Backend tests | `pytest`, `pytest-asyncio`, FastAPI `TestClient` |

---

## 2. Architecture decision (ADR-001)

**Status:** Accepted · **Date:** 2026-11-14

**Context.** Single-user research prototype. Must run locally, no DB yet, must swap LLM providers easily, and the main risk is LLM output quality, not scale.

**Decision.** Two processes: a Vite React SPA and a FastAPI service. The backend owns PDF storage, text extraction, retrieval, prompting, provider calls and session persistence. The frontend never calls an LLM directly. Providers implement one abstract interface and register in a registry keyed by `provider_id`. Persistence is behind a `SessionStore` interface with a JSON-file implementation.

| Option | Complexity | Swap providers later | DB migration later | Verdict |
|---|---|---|---|---|
| A. SPA + FastAPI, provider registry, store interface | Low | Add one class | Add one class | **Chosen** |
| B. SPA calling LLM APIs directly | Lowest | Keys leak to browser; no grounding step | n/a | Rejected |
| C. Full stack w/ Postgres + task queue | High | Same as A | Already there | Premature |

**Consequences.** Easier: adding providers/stores, unit-testing prompts with the Mock provider. Harder: nothing significant. Revisit: streaming (SSE) once real latency is known; a DB once multi-user is needed.

```
React SPA (Vite :5173)  ──/api (proxied)──▶  FastAPI (:8000)
                                              ├─ routers/       HTTP layer
                                              ├─ services/
                                              │   ├─ documents.py   store PDF, extract pages
                                              │   ├─ retrieval.py   BM25 over page chunks
                                              │   ├─ expansion.py   prompt → provider → parse → verify
                                              │   └─ prompts/       templates
                                              ├─ providers/     base.py, registry.py, ukp.py, mock.py, openai_compat.py
                                              └─ storage/       SessionStore (JSON files) + uploads/
```

---

## 3. Repository layout

```
/
├─ SPEC.md
├─ README.md                      # setup + run instructions (generate it)
├─ backend/
│  ├─ pyproject.toml              # or requirements.txt — pin versions you install
│  ├─ .env.example
│  ├─ app/
│  │  ├─ main.py                  # FastAPI app, CORS, router mounting
│  │  ├─ config.py                # Settings (pydantic-settings)
│  │  ├─ models.py                # all Pydantic schemas (§4.2)
│  │  ├─ routers/{health,providers,documents,sessions,expand}.py
│  │  ├─ services/{documents,retrieval,expansion}.py
│  │  ├─ services/prompts/expansion.py
│  │  ├─ providers/{base,registry,mock,openai_compat,ukp}.py
│  │  └─ storage/{base,json_store}.py
│  ├─ data/                       # gitignored: uploads/ and sessions/
│  └─ tests/
└─ frontend/
   ├─ package.json, vite.config.ts (proxy /api → http://localhost:8000)
   └─ src/
      ├─ main.tsx, App.tsx
      ├─ styles/{tokens.css,global.css}
      ├─ api/client.ts            # typed fetch wrappers for §4.3
      ├─ api/types.ts             # mirrors backend schemas
      ├─ store/{sessionStore,settingsStore,uiStore}.ts
      ├─ pages/{NewReviewPage,ReviewPage}.tsx
      └─ components/
         ├─ layout/{TopBar,HistorySidebar,AppShell}.tsx
         ├─ pdf/{PdfViewer,PdfToolbar,SelectionContextMenu}.tsx
         ├─ review/{ReviewOutput,ReviewSection}.tsx
         ├─ expansion/{ExpansionPanel,JudgmentBubble,CandidateCard,VerificationNote,Composer,AttachmentChip}.tsx
         ├─ settings/SettingsPopover.tsx
         └─ upload/{Dropzone,VenuePicker,RolePicker}.tsx
```

---

## 4. Backend specification

### 4.1 Config (`app/config.py`, `.env.example`)

```
DATA_DIR=./data
MAX_UPLOAD_MB=25
DEFAULT_PROVIDER=mock            # switch to "ukp" once credentials are set
CORS_ORIGINS=http://localhost:5173

# UKP inference API — fill from the UKP API docs linked in the brief
UKP_API_BASE=
UKP_API_KEY=
UKP_MODEL=Qwen3.8-27B            # use the exact model id the UKP API expects

# Optional OpenAI-compatible provider
OPENAI_COMPAT_API_BASE=
OPENAI_COMPAT_API_KEY=
OPENAI_COMPAT_MODEL=
```

> ⚠️ **Assumption to confirm:** the brief links to UKP API docs that were not included in the PDF. This spec assumes the UKP endpoint is **OpenAI-compatible** (`POST {base}/chat/completions`, Bearer auth). If it isn't, only `providers/ukp.py` changes — keep its public interface as in §4.5.

A provider is **available** only when its required env vars are non-empty (Mock is always available).

### 4.2 Schemas (`app/models.py`)

```python
Verbosity = Literal["concise", "balanced", "detailed"]
Section   = Literal["summary", "strengths", "weaknesses", "questions"]
Role      = Literal["reviewer", "author"]

class GenerationParams(BaseModel):
    verbosity: Verbosity = "balanced"
    num_candidates: int = Field(3, ge=2, le=6)
    temperature: float = Field(0.8, ge=0.0, le=1.5)
    max_tokens: int | None = None          # None = derive from verbosity (§4.5)

class DocumentMeta(BaseModel):
    id: str; filename: str; num_pages: int; uploaded_at: datetime

class EvidenceRef(BaseModel):              # user-attached, from the PDF context menu
    id: str
    kind: Literal["evidence", "snippet"]
    text: str
    page: int                              # 1-based

class CandidateEvidence(BaseModel):        # model-cited
    quote: str
    page: int | None
    verified: bool = False                 # set by backend fuzzy match (§4.5 step 6)

class Candidate(BaseModel):
    id: str
    label: str                             # "A", "B", ...
    angle: str                             # ≤ 5 words, e.g. "Missing baseline"
    text: str
    probability: float                     # verbalized probability, 0..1
    evidence: list[CandidateEvidence]
    status: Literal["pending", "selected", "rejected", "accepted"] = "pending"

class Turn(BaseModel):
    id: str
    judgment: str
    section: Section
    attachments: list[EvidenceRef]
    params: GenerationParams
    provider_id: str; model: str
    candidates: list[Candidate]
    created_at: datetime

class ReviewItem(BaseModel):
    id: str; section: Section; text: str
    source_turn_id: str | None; source_candidate_id: str | None

class Session(BaseModel):
    id: str
    title: str                             # defaults to PDF title/filename
    document: DocumentMeta
    venue: str                             # "ARR" | "ICLR" | "Custom"
    role: Role
    turns: list[Turn] = []
    review: list[ReviewItem] = []
    created_at: datetime; updated_at: datetime

class SessionSummary(BaseModel):           # for the sidebar
    id: str; title: str; venue: str; role: Role
    num_turns: int; updated_at: datetime
```

### 4.3 HTTP API (prefix `/api`)

| Method | Path | Body / Query | Returns | Notes |
|---|---|---|---|---|
| GET | `/health` | — | `{"status":"ok"}` | |
| GET | `/providers` | — | `[{id, name, available, models:[str], default_model}]` | |
| POST | `/documents` | multipart `file` | `DocumentMeta` | 415 if not PDF (check `%PDF-` magic bytes, not just extension); 413 if > `MAX_UPLOAD_MB`; extract text per page at upload and cache to `data/uploads/{id}.pages.json` |
| GET | `/documents/{id}/file` | — | `application/pdf` | |
| GET | `/sessions` | — | `list[SessionSummary]` sorted by `updated_at` desc | |
| POST | `/sessions` | `{document_id, venue, role}` | `Session` | |
| GET | `/sessions/{id}` | — | `Session` | |
| PATCH | `/sessions/{id}` | `{title?}` | `Session` | rename |
| DELETE | `/sessions/{id}` | — | 204 | |
| POST | `/sessions/{id}/expand` | `ExpandRequest` | `Turn` | §4.5; appends turn to session |
| POST | `/sessions/{id}/turns/{turn_id}/decision` | `{selected_ids:[str], rejected_ids:[str], add_to_review:bool}` | `Session` | selected → `accepted` + new `ReviewItem`s in the turn's section when `add_to_review` |
| PUT | `/sessions/{id}/review` | `{items: list[ReviewItem]}` | `Session` | manual edits/reorder/delete of review items |

```python
class ExpandRequest(BaseModel):
    judgment: str = Field(min_length=3, max_length=2000)
    section: Section = "weaknesses"
    attachments: list[EvidenceRef] = []
    provider_id: str
    model: str | None = None
    params: GenerationParams = GenerationParams()
```

Errors: JSON `{"detail": str, "code": str}`. Codes: `provider_unavailable` (400), `provider_error` (502), `parse_error` (502, after one repair retry), `not_found` (404), `invalid_file` (415), `file_too_large` (413).

### 4.4 Storage

- `SessionStore` (abstract): `list() / get(id) / create(s) / update(s) / delete(id)`.
- `JsonFileSessionStore`: one file per session at `data/sessions/{id}.json`; write to a temp file then `os.replace` (atomic). Guard writes with an `asyncio.Lock` per session id.
- Uploaded PDFs: `data/uploads/{document_id}.pdf`; pages: `data/uploads/{document_id}.pages.json` (`[{page:int, text:str}]`).
- IDs: `uuid4().hex`.

### 4.5 Expansion pipeline (`services/expansion.py`)

1. **Load** page texts for the session's document.
2. **Retrieve context.** Split each page into ~800-character chunks (keep `page`). Rank with BM25 using the query `judgment + " " + " ".join(attachment texts)`. Take top 6 chunks. Always prepend user attachments (they are highest-priority evidence). Hard cap the context at ~12,000 characters.
3. **Build prompt** (`prompts/expansion.py`) — see template below. Verbosity → length guidance and default `max_tokens`:
   | verbosity | guidance | default max_tokens (whole response) |
   |---|---|---|
   | concise | 1–2 sentences per candidate | 600 |
   | balanced | 2–4 sentences per candidate | 1000 |
   | detailed | one paragraph (4–6 sentences) per candidate | 1600 |
4. **Call provider** with `temperature`, `max_tokens`.
5. **Parse.** Strip any `<think>…</think>` block (Qwen3 models may emit reasoning). Extract the first JSON object; validate into the schema below. On failure, make **one** repair call (send the raw output + "Return only valid JSON matching the schema"). If it still fails, raise `parse_error`.
6. **Verify citations.** For each `evidence.quote`, run `rapidfuzz.fuzz.partial_ratio` against each page's normalized text (lowercase, collapse whitespace, de-hyphenate line breaks). If best score ≥ 90: `verified=True` and set `page` to the matching page (overriding the model's page). Otherwise `verified=False`.
7. **Normalize** probabilities to sum to 1 across candidates; sort descending; assign labels A, B, C…
8. Return the `Turn` and persist it.

**Prompt template (verbalized sampling).** Keep it in one module so it can be iterated on:

```
SYSTEM:
You help {role_phrase} write a peer review of a scientific paper for {venue}.
Given the user's judgment about the paper, generate {k} distinct candidate expansions
that elaborate and support the judgment using evidence from the paper excerpts.
Rules:
- Ground every candidate in the excerpts. Each candidate must cite 1–3 short verbatim
  quotes (≤ 30 words each) from the excerpts, with their page numbers.
- Candidates must take different angles (e.g. missing baselines, insufficient
  experiments, evaluation-setup limitations) — not paraphrases of each other.
- Do not invent facts, numbers, citations or sections not present in the excerpts.
- Length: {verbosity_guidance}
- Write in the voice of a constructive reviewer, suitable for the "{section}" section.
{guidelines_block}   # empty string in v0.1 — hook for Req. 4
Sample the {k} responses from the full distribution of plausible expansions and, for each,
give a probability (0–1) of it being a good expansion of this judgment.
Return ONLY JSON:
{"candidates":[{"angle":str,"text":str,"probability":float,
  "evidence":[{"quote":str,"page":int}]}]}

USER:
Judgment: {judgment}
User-attached evidence:
{attachments as "- (p.{page}) \"{text}\"" or "none"}
Paper excerpts:
{chunks as "[p.{page}] {text}"}
```

`role_phrase` = "a reviewer" or "an author self-reviewing their own paper".

### 4.6 Provider layer (Req. 2)

```python
class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]; content: str

class LLMResult(BaseModel):
    text: str; model: str; usage: dict | None = None

class LLMProvider(ABC):
    id: ClassVar[str]; name: ClassVar[str]
    @abstractmethod
    def is_available(self) -> bool: ...
    @abstractmethod
    def models(self) -> list[str]: ...
    @abstractmethod
    async def complete(self, messages: list[ChatMessage], *, model: str,
                       temperature: float, max_tokens: int) -> LLMResult: ...
```

- `registry.py`: `register(provider)`, `get(id)` (raises `provider_unavailable`), `list_all()`. Providers self-register at import in `providers/__init__.py`.
- `OpenAICompatProvider`: generic `POST {base}/chat/completions` via `httpx.AsyncClient(timeout=120)`. Maps HTTP/network errors to `provider_error`.
- `UKPProvider(OpenAICompatProvider)`: `id="ukp"`, `name="UKP inference API"`, reads `UKP_*` settings.
- `MockProvider`: `id="mock"`, always available, **deterministic**: picks real sentences from the user message's excerpts and returns valid JSON with `k` candidates (so the full UI works offline and tests are stable).
- Adding a provider = one file + one `register()` line. Document this in README.

**Extension points to leave as no-op stubs (named, with docstrings):**
`services/guidelines.py: get_guidelines(venue) -> str` (returns `""`) · `services/validation.py: validate_judgment(text) -> ValidationResult(ok=True)` · `services/challenge.py` (empty module with a TODO docstring for Req. 6).

---

## 5. Frontend specification

### 5.1 Design tokens (`src/styles/tokens.css`)

```css
:root{
  /* color */
  --bg-app:#F4F5F7; --bg-sidebar:#EEF0F3; --bg-panel:#F8F9FA; --bg-pdf:#E6E8EC;
  --surface:#FFFFFF; --border:#E3E5EA; --border-strong:#D5D8DE; --hover:#E4E7EC;
  --text:#15171C; --text-paper:#1D2028; --text-2:#3A3F4B; --text-muted:#5A6170;
  --accent:#2B4BCF; --accent-hover:#1E3699; --accent-soft:#EBEFFD; --accent-tint:#F7F9FF;
  --selection:#C9D4FB;
  --evidence-bg:#FFF4D6; --evidence-border:#F3DFA6; --evidence-text:#8A5A00; --evidence-mark:#F5C542; --evidence-highlight:#FDE7A8;
  --note-bg:#FFF8E6; --note-text:#5C3D00;
  --success:#1F7A4D; --success-bg:#E7F4EC; --accepted-bg:#F1F8F4; --danger:#B42318;
  --ink:#15171C;   /* primary dark button */
  /* type */
  --font-ui:"Inter",system-ui,sans-serif;
  --font-paper:"Source Serif 4",Georgia,serif;   /* PDF-adjacent + review text */
  --fs-11:11px; --fs-12:12px; --fs-13:13px; --fs-14:14px; --fs-15:15px; --fs-17:17px; --fs-34:34px;
  --label-tracking:0.06em;  /* UPPERCASE 11–12px section labels, weight 600 */
  /* space (4px scale) */
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px; --s-6:24px; --s-8:32px; --s-12:48px; --s-16:64px;
  /* radius */
  --r-sm:6px; --r-md:8px; --r-lg:12px; --r-xl:14px; --r-pill:999px;
  /* elevation */
  --shadow-1:0 1px 2px rgba(21,23,28,.08);
  --shadow-2:0 2px 10px rgba(21,23,28,.08);
  --shadow-pop:0 14px 36px rgba(21,23,28,.18);
  /* motion */
  --dur-fast:120ms; --dur-med:200ms; --ease:cubic-bezier(.2,.7,.2,1);
  /* layout */
  --topbar-h:56px; --sidebar-w:264px; --sidebar-rail-w:60px; --panel-min-w:440px;
}
```

Load Inter (400/500/600/700) and Source Serif 4 (400/600/700) from Google Fonts in `index.html`.
Rule of thumb: **sans for tools, serif for the paper and the review prose** (candidate text, review text).
All text/background pairs above meet WCAG AA 4.5:1 — don't introduce lighter greys for text.

### 5.2 Routes

- `/` → redirect to most recent session, or `/new` if none.
- `/new` → `NewReviewPage`.
- `/r/:sessionId` → `ReviewPage`.
Use `react-router-dom`. The sidebar is shared by both pages via `AppShell`.

### 5.3 Layout (`AppShell` + `ReviewPage`)

```
┌───────────── TopBar 56px ─────────────────────────────────────────────────────────┐
│ [≡] ▣ Review Assistant / <paper title…> [ARR]       ✓Saved [●UKP Qwen3.8-27B ⚙] [Export] │
├──────────┬───────────────────────────────┬──────────────────────────────────────┤
│ History  │ PdfToolbar 44px               │ (scroll) ReviewOutput card            │
│ sidebar  │───────────────────────────────│          ExpansionPanel card          │
│ 264px    │ PdfViewer (scroll, centered   │──────────────────────────────────────│
│ (60px    │ pages, max-width ~720px)      │ Composer (pinned to bottom)           │
│ rail)    │                               │                                      │
└──────────┴───────────────────────────────┴──────────────────────────────────────┘
```

- Body row height `calc(100vh - var(--topbar-h))`; PDF column and panel scroll independently.
- PDF column `flex: 1 1 520px`; panel `flex: 1 1 440px`, user-resizable via a 6px drag handle between them (min 380px each). Persist width in `localStorage` (`ra.panelWidth`).
- Below 900px viewport width: columns stack, page scrolls normally, sidebar becomes an overlay drawer.

### 5.4 Components (behaviour contract)

**TopBar** — sidebar toggle (`aria-label="Toggle chat history"`, shortcut `Ctrl/⌘+B`), app mark + name, paper title (ellipsis), venue pill, save status (`Saving…`/`Saved`/`Save failed`), model pill (green dot if provider available; opens `SettingsPopover`), Export button (copies review Markdown to clipboard, shows a toast "Review copied as Markdown").

**HistorySidebar** (the chat-history feature)
- Expanded 264px / collapsed 60px rail; animate width with `--dur-med`; state persisted in `localStorage` (`ra.sidebarOpen`).
- Top: "New review" (→ `/new`), search input (client-side filter on title).
- Groups by `updated_at`: **Today**, **Yesterday**, **Previous 7 days**, **Previous 30 days**, **Older**.
- Item: title (1 line, ellipsis) + meta `"{venue} · {n} judgments"` or `"{venue} · author mode"`. Active item: white bg + `--shadow-1`.
- Item hover shows a `⋯` button → menu: Rename (inline edit, Enter saves, Esc cancels) and Delete (confirm dialog). Calls PATCH / DELETE.
- Collapsed rail: New review icon button + History icon button that expands the sidebar.
- `<nav aria-label="Review history">`; items are links.

**PdfToolbar** — prev/next, page input `n / total`, zoom − / % / + (50–300%, step 10), "fit width", evidence counter pill (`{n} evidence marked`), search button (v0.1: may open browser find; full search is optional).

**PdfViewer** — renders all pages with `react-pdf` `<Page renderTextLayer renderAnnotationLayer={false}>`, lazy (render pages within ±2 of viewport). Tracks the current page via IntersectionObserver. Exposes `scrollToPage(page, quote?)`; if `quote` is given, briefly flash a highlight over the matching text-layer spans (fuzzy-match on the client by normalized substring; fall back to just scrolling).
Persistent highlights: evidence the user added is shown with `--evidence-highlight` behind the text-layer spans (store `{page, text}`; re-apply after page render by matching text-layer content).

**SelectionContextMenu (Req. 1)** — exact behaviour:
1. On `contextmenu` inside the PDF text layer: if `window.getSelection()` is non-empty and fully inside one or more page text layers → `preventDefault()` and open the custom menu at the cursor (clamped to viewport). Otherwise let the native menu show.
2. Captured selection: `{text (whitespace-normalized), page (of the selection's anchor), wordCount}`.
3. Header line: `"{wordCount} words selected · p. {page}"`.
4. Items (with shortcut hints, active while the menu is open):
   - **Add as evidence** `E` → adds `EvidenceRef{kind:"evidence"}` to the composer's attachments; adds a persistent highlight.
   - **Insert as quoted snippet** `S` → inserts `“{text}” (p. {page})` at the composer's caret and adds `EvidenceRef{kind:"snippet"}`.
   - **Start judgment from selection** `J` → clears composer, adds the selection as evidence, focuses the textarea.
   - — divider —
   - **Highlight** → persistent highlight only (no attachment).
   - **Copy** `⌘/Ctrl+C` → clipboard.
5. Closes on Esc, outside click, scroll, or after an action. Arrow keys move focus; Enter activates. `role="menu"` / `role="menuitem"`; focus first item on open; restore focus on close.
6. If no session is active (shouldn't happen on `/r/:id`), items are disabled.

**ReviewOutput** — card titled `YOUR REVIEW · {venue} form`, word count, Copy button. Sections in order: Summary, Strengths, Weaknesses, Questions (empty sections show a muted hint "Accepted expansions land here."). Review text in serif. Each `ReviewItem` is inline-editable (click to edit, blur saves via PUT), deletable (hover ×), and shows a small green source tag (`· p. 6`) linking back to its first verified citation. Newly added items flash `--accepted-bg` for 1.5s.

**ExpansionPanel** — renders turns oldest→newest (latest expanded, older ones collapsed to a one-line summary "Weakness · 3 candidates · 2 accepted"). Per turn:
- `JudgmentBubble`: the user's judgment, right-aligned, dark (`--ink`) bubble, plus a chip `"{n} evidence · p. x, y"`.
- `VerificationNote` (always shown above candidates): "Each candidate cites where it comes from. Open the citation and check it against the paper before adding it to your review."
- `CandidateCard` × N:
  - Header: checkbox button (`aria-pressed`), `Option {label}`, angle, probability pill `p ≈ 0.41` (tooltip: "Verbalized probability reported by the model"), Refine (pencil) and Reject (×) icon buttons with `aria-label`s.
  - Body: candidate text in serif.
  - Footer: "Grounded in" + one chip per evidence item: `p. {page} ↗`. Verified chips use evidence colours and click → `scrollToPage(page, quote)`. **Unverified chips** use a dashed `--border-strong` outline with the label "unverified quote" and tooltip "This quote could not be found in the paper."
  - Selected state: `--accent` 1.5px border + `--accent-tint` bg. Rejected cards collapse to a one-line "Option B rejected · Undo".
  - Clicking anywhere on the card body toggles selection (except on links/buttons).
  - **Refine** (v0.1): puts the candidate text into the composer prefixed with `Refine: ` and focuses it; the next Expand creates a new turn. (No dedicated refine endpoint yet.)
- Footer row: Reject all · Regenerate (re-runs the same request) · `{n} selected` · primary button **"Add to {Section} →"** (disabled when 0 selected) → POST decision with `add_to_review: true`.
- Loading state: 3 skeleton cards with shimmer; the Expand button shows a spinner and is disabled. Error state: inline red-bordered card with the `detail` message and a Retry button.

**Composer** (pinned bottom)
- Attachment chips (`AttachmentChip`): bold kind label, quoted text (ellipsis at 220px), `p. n`, remove ×.
- Textarea (auto-grow 2→8 rows). Placeholder: *Write a judgment, e.g. "The experimental evaluation is a weakness." Right-click text in the PDF to attach evidence.*
- Row: Section select (Weakness / Strength / Question / Summary — maps to `Section`), Verbosity segmented control (Concise / Balanced / Detailed, bound to settings store), **Expand →** primary button.
- `Enter` submits, `Shift+Enter` newline. Disabled when text < 3 chars or a request is in flight.
- Focus ring: 1.5px `--accent` border + 4px `--accent-soft` outer ring.
- Below: muted 11px line "Candidates are drafts grounded in the paper — you decide what goes in your review."

**SettingsPopover (Req. 2 + 3)** — 380px wide, anchored under the model pill, `role="dialog"`.
- **API provider** radio cards from `GET /providers`: name, sub-line, badge (`Connected` green / `Dev` / `Not configured` grey, disabled).
- **Model** select (provider's `models`).
- **Verbosity** segmented control + hint text (from the table in §4.5).
- **Candidates per judgment** stepper (2–6).
- **Diversity (temperature)** slider 0.0–1.5 step 0.1, labels Focused ↔ Varied, value shown.
- **Max length** select: Auto (from verbosity) / 256 / 512 / 1024 tokens.
- Footer: status line `"{provider} · {model}"`, Reset (defaults), Apply (closes).
- Persist to `localStorage` (`ra.settings`). Settings apply to subsequent Expand calls.

**NewReviewPage** — serif H1 "Start a new review", one-line description, **Dropzone** (drag-drop + click to browse; accept `application/pdf`; shows progress, then a file card "Uploaded · {n} pages · text extracted" with remove ×; inline error for wrong type/too large), **Venue** pills (ARR / ICLR / Custom), **I am reviewing as** pills (Reviewer / Author (self-review)), primary "Open review workspace →" (disabled until uploaded) → `POST /sessions` → navigate to `/r/:id`.

### 5.5 State (zustand)

- `settingsStore`: `{providerId, model, params: GenerationParams}` + persisted.
- `sessionStore`: `{summaries, current: Session|null, loading, error}`, actions `loadSummaries, loadSession, createSession, expand, decide, updateReview, rename, remove`. After any mutation, update both `current` and the matching summary (sidebar must reflect new turn counts without reload).
- `uiStore`: `{sidebarOpen, panelWidth, attachments: EvidenceRef[], highlights: {page,text}[], composerText, pdf: {page, zoom}}`.

### 5.6 Accessibility & quality bar

- Real `<button>`/`<a>`/`<input>` everywhere; icon-only buttons have `aria-label`.
- All interactive targets ≥ 32px (≥ 44px on touch breakpoints).
- Visible focus states on everything (`:focus-visible` outline 2px `--accent`, offset 2px).
- `prefers-reduced-motion`: disable shimmer and width animations.
- No emoji in UI. No lorem ipsum anywhere.

---

## 6. Milestones & checks (implement in order)

**M1 — Skeletons.** Backend app boots with `/api/health`; frontend Vite app renders `AppShell` with tokens and fonts.
✔ `uvicorn app.main:app --reload` → `GET /api/health` 200. ✔ `npm run dev` shows the shell.

**M2 — Providers (Req. 2).** base, registry, Mock, OpenAICompat, UKP; `GET /api/providers`.
✔ pytest: Mock always available; UKP unavailable when env empty; registry raises on unknown id; OpenAICompat maps a mocked 500 to `provider_error` (use `httpx.MockTransport`).

**M3 — Documents + upload UI.** Upload, magic-byte check, size limit, page extraction, file serving; NewReviewPage.
✔ pytest: non-PDF → 415; PDF → `num_pages` correct (generate a 2-page PDF in the test with pypdf). ✔ Manual: upload a real paper, see the file card.

**M4 — Sessions + history sidebar.** JSON store, session CRUD, sidebar with grouping, search, rename, delete, collapse/persist.
✔ pytest: create → list → rename → delete round-trip; files appear/disappear in `data/sessions`. ✔ Manual: reload page, sidebar state and sessions persist.

**M5 — PDF reader + context menu (Req. 1).** PdfViewer, toolbar, selection capture, context menu, highlights, `scrollToPage`.
✔ vitest: menu opens only with a selection; Esc closes; E adds an attachment to `uiStore`. ✔ Manual: select text on page 3, right-click → Add as evidence → chip shows "p. 3".

**M6 — Expansion pipeline + panel.** Retrieval, prompt, parse (+repair), citation verification, `/expand`, `/decision`; ExpansionPanel, CandidateCard, Composer, ReviewOutput.
✔ pytest with Mock: `/expand` returns `num_candidates` candidates, probabilities sum to 1 (±1e-6), labels A..; quotes from the doc get `verified=True`, a fabricated quote gets `False`; parser strips `<think>` and recovers JSON wrapped in prose/code fences. ✔ Manual: select 2 candidates → Add to Weaknesses → both appear in the review; sidebar turn count increments.

**M7 — Settings (Req. 3).** SettingsPopover wired to store and to `/expand` params.
✔ pytest: `num_candidates=5` → 5 candidates (Mock); `verbosity` changes the prompt guidance (assert on the built prompt string); invalid temperature → 422. ✔ Manual: switch provider to UKP (with env set) and run one expansion.

**M8 — Polish.** Loading/empty/error states, responsive stacking < 900px, keyboard shortcuts (`⌘/Ctrl+B` sidebar, `E/S/J` in menu, `Enter` to expand), README with setup, env, and "how to add a provider".

---

## 7. Definition of done (v0.1)

- [ ] `README.md` lets a new developer run both apps in < 5 minutes with `DEFAULT_PROVIDER=mock`.
- [ ] All pytest and vitest suites pass.
- [ ] Full flow works end-to-end with Mock: upload → session → select PDF text → add evidence → expand → multi-select → add to review → reload page → everything persists.
- [ ] Switching to UKP needs only `.env` changes.
- [ ] No secrets in the frontend bundle; `.env` and `data/` are gitignored.
