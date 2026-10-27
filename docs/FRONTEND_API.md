# EduSearch AI — Frontend (Student UI) API Guide

Complete request and response reference for the **student search / chat UI**.
For admin panel, PDF question extraction, formula rendering, and paper approval APIs, see [`EXTRACTION_FRONTEND_GUIDE.md`](EXTRACTION_FRONTEND_GUIDE.md).

Everything below matches the current source (`src/**`) and e2e tests (`test/**`).

---

## 0. Before you start

| Item | Value |
| --- | --- |
| Base URL (local) | `http://localhost:3000` (port from `PORT` env; default `3000`) |
| Global prefix | **None**. Paths are exact (e.g. `/questions/search`, `/api/chat`). |
| Auth | **None**. No headers or tokens. |
| Request format | `application/json` |
| Timeouts | Each OpenAI call has a 20 s server timeout. `/questions/answer` and `/api/chat` may make two calls — allow **at least 45 s** on the client. |

### CORS

- `localhost` / `127.0.0.1` (any port) are **always allowed** — no env entry needed.
- Deployed SPAs go in `CORS_ORIGINS` (comma-separated full origins):

```env
CORS_ORIGINS=https://app.example.com,https://staging.example.com
```

`OPTIONS` preflight and the `ngrok-skip-browser-warning` header are allowed.

### Endpoints for this UI

**Production (use these in the student SPA):**

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| GET | `/health` | Optional readiness check | 200 |
| GET | `/questions/filters` | Subject / Time period / Difficulty / Year dropdown options | 200 |
| POST | `/questions/search` | Closest exam questions (list under the answer) | 200 |
| POST | `/questions/answer` | Grounded answer as JSON (Figma Search button) | 200 |
| POST | `/api/chat` | Same answer as a streaming chat message | 200 |

**Experimental only — do not wire into the student SPA:** `POST /questions/search/hybrid`, `POST /questions/search/rewritten`. Production answer/chat use original-query vector search (`text-embedding-3-small`). See `eval/RETRIEVAL_DECISION.md`.

Reference pages (not for production SPA): `GET /demo` (Figma-style screen), `GET /playground` (raw request/response tester).

### Figma search screen → API

| Figma element | API |
| --- | --- |
| Subject / Time period / Difficulty / Year dropdowns | Load from `GET /questions/filters` |
| Search box + Search button | Call `POST /questions/answer` **and** `POST /questions/search` in parallel with the **same** body |
| Subject | `subject` |
| Time period | `yearFrom` + `yearTo` from the chosen `timePeriods` item |
| Difficulty | `difficulty` (`EASY` \| `MEDIUM` \| `HARD`) |
| Year | `examYear` |
| Mic | Browser Web Speech API only — no backend |
| "+" attach | Not supported — hide or disable |

---

## 1. Shared conventions

### Enums

```ts
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QuestionType = 'MCQ' | 'SHORT' | 'LONG';
```

On REST (`/questions/*`) enums are **uppercase and case-sensitive**.
On chat, `filters.difficulty` also accepts `Easy` / `medium` / etc.

### Text notation in `questionText`, `answer`, `explanation`

| In JSON | Meaning | Render as |
| --- | --- | --- |
| `^{8}` | superscript | `<sup>8</sup>` or KaTeX |
| `_{2}` | subscript | `<sub>2</sub>` or KaTeX |
| `\n` | line / sub-part break | line break |

```ts
export function renderScripts(text: string): string {
  return text
    .replace(/\^\{([^}]{1,8})\}/g, '<sup>$1</sup>')
    .replace(/_\{([^}]{1,8})\}/g, '<sub>$1</sub>');
}
```

`/api/chat` already converts these to KaTeX (`$^{8}$`) inside Markdown.

### Standard error body (all REST endpoints except chat stream errors)

```json
{
  "statusCode": 400,
  "message": "query is required.",
  "error": "Bad Request"
}
```

| Status | Meaning |
| --- | --- |
| 400 | Validation failed. Show `message` to the user. |
| 503 | OpenAI or database unavailable. `message` is safe to show. |
| 500 | Unexpected error. |

Chat uses a different error shape — see §5.4.

---

## 2. Health (optional)

### `GET /health`

**Response `200`**

```json
{ "status": "ok", "database": "up" }
```

**Response `503`**

```json
{ "status": "error", "database": "down", "message": "Database is unavailable." }
```

---

## 3. Filters — `GET /questions/filters`

No body. Returns only values that exist in the database (with counts), so
dropdowns never offer empty options.

**Response `200`**

```json
{
  "subjects": [
    { "value": "Chemistry", "count": 22 },
    { "value": "Physics", "count": 46 }
  ],
  "years": [
    { "value": 2024, "count": 48 },
    { "value": 2023, "count": 20 }
  ],
  "difficulties": [{ "value": "MEDIUM", "count": 68 }],
  "timePeriods": [
    { "label": "Last 3 Years", "yearFrom": 2024, "yearTo": 2026, "count": 48 },
    { "label": "Last 5 Years", "yearFrom": 2022, "yearTo": 2026, "count": 68 },
    { "label": "Last 10 Years", "yearFrom": 2017, "yearTo": 2026, "count": 68 }
  ],
  "total": 68
}
```

| Field | Notes |
| --- | --- |
| `subjects` | A–Z |
| `years` | Newest first |
| `difficulties` | Only those present, order EASY → MEDIUM → HARD |
| `timePeriods` | Counted back from the **current calendar year**, inclusive |
| `total` | Ready questions in DB |

**How to wire dropdowns**

1. Subject → send `subject: option.value` (exact, case-sensitive).
2. Year → send `examYear: option.value`.
3. Difficulty → send `difficulty: option.value`.
4. Time period → send `yearFrom` + `yearTo` from the chosen item (REST), **or** send `filters.timePeriod: option.label` (chat).
5. Disable a time-period option when `count === 0`.
6. "All" / no filter → omit the field or send `null` / `""`.

**Error**: `503` — `Filter options could not be loaded.`

---

## 4. Shared search / answer request body

Used by:

- `POST /questions/search`
- `POST /questions/search/hybrid`
- `POST /questions/answer`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `query` | string | **yes** | trimmed, 1–1000 characters |
| `subject` | string \| null | no | exact, case-sensitive; `""` = no filter |
| `examYear` | integer \| null | no | 1950–2100 (Year dropdown) |
| `yearFrom` | integer \| null | no | 1950–2100, inclusive (Time period) |
| `yearTo` | integer \| null | no | 1950–2100, inclusive; must be ≥ `yearFrom` |
| `difficulty` | `Difficulty` \| null | no | `EASY` \| `MEDIUM` \| `HARD` |
| `limit` | integer | no | 1–20, default `5` |

All filters combine with **AND**. If both `examYear` and a time period are set,
the year must fall inside the range or nothing matches.

**Example request**

```json
{
  "query": "How does glucose react with hydroxylamine?",
  "subject": "Chemistry",
  "yearFrom": 2022,
  "yearTo": 2026,
  "difficulty": "MEDIUM",
  "limit": 10
}
```

**Shared 400 messages**

- `query is required.`
- `query must be at most 1000 characters.`
- `limit must be an integer from 1 to 20.`
- `difficulty must be one of EASY, MEDIUM, HARD.`
- `examYear must be an integer from 1950 to 2100.`
- `yearFrom must be an integer from 1950 to 2100.`
- `yearTo must be an integer from 1950 to 2100.`
- `yearFrom must not be after yearTo.`

---

## 5. Search — `POST /questions/search`

Semantic (vector) search. Use this for the **“Closest exam questions”** list
under the answer card. Recommended `limit`: `10`.

**Request**: shared body above.

**Response `200`** — best match first

```json
{
  "results": [
    {
      "id": "7b1a3c9e-4a2b-4f0e-9a51-2a0d4f3c1e11",
      "questionText": "State Newton's second law of motion.",
      "subject": "Physics",
      "topic": "Laws of Motion",
      "subtopic": "Second law",
      "examYear": 2024,
      "examType": "board",
      "difficulty": "MEDIUM",
      "questionType": "SHORT",
      "sourceDocument": "physics-2024.pdf#sha256:3f2a9c…",
      "pageReference": "4",
      "score": 0.83
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `score` | Cosine similarity, roughly 0–1. Higher = closer. Backend treats **≥ 0.45** as “related” for answering. |
| `results` | Always up to `limit` closest rows, even if unrelated. Can be `[]`. |
| Display | Hide rows with `score` below ~`0.3` (demo does). Show “no closely matching questions” instead. |
| Filename | `sourceDocument.split('#')[0]` |

**503**: `Embedding request failed.` · `Question search failed.` · `OpenAI API key is not configured.`

---

## 6. Hybrid search — `POST /questions/search/hybrid` (experimental)

**Not for the student UI.** Same request body as §5. Runs vector + Postgres
full-text search and merges with Reciprocal Rank Fusion. Kept for offline
evaluation only; production list + answer use `/questions/search`.

**Response `200`**

```json
{
  "vector": [
    { "id": "a1…", "questionText": "…", "pageReference": "4", "rank": 1 }
  ],
  "lexical": [
    { "id": "b2…", "questionText": "…", "pageReference": "7", "rank": 1 }
  ],
  "hybrid": [
    {
      "id": "a1…",
      "questionText": "…",
      "pageReference": "4",
      "rank": 1,
      "vectorRank": 1,
      "lexicalRank": 3
    }
  ]
}
```

- Each list is cut to `limit`.
- `vectorRank` / `lexicalRank` are `null` when the item was missing from that branch.
- Display **`hybrid`** only. Items have no `subject` / `score`.

Errors: same as §5.

---

## 7. Answer — `POST /questions/answer` (main Search button)

Same request body as §5. Backend:

1. Searches for related questions (score ≥ 0.45).
2. Asks the model to **quote** text from those sources (never invent paper quotes).
3. Verifies every quote word-for-word against stored text.
4. Rejects question stems, “Define X as …”, MCQ options, and Assertion/Reason claims as answers.
5. If related questions exist but none states the fact → `insufficient` + optional AI `explanation`.

**Response `200`** — always one of three `status` values:

| `status` | What to show in the UI |
| --- | --- |
| `answered` | Label **“Answer from the papers”** → show `answer` + cited `sources` |
| `insufficient` + `explanation` | Label **“AI explanation (not quoted from the papers)”** → show `explanation`; list `sources` as related questions |
| `insufficient` + `explanation: null` | Show `answer` text; list `sources` as related |
| `guidance` | Greetings: short welcome asking what to search (no subject menu). “Help / what can you do”: subjects + short topics from the admin bank — no sources |
| `out_of_scope` | `answer` = not found in papers; optional `explanation` = labelled AI help for study topics; no sources |

### 7.1 `answered`

Papers state the fact. `answer` = verified quote(s) joined by `\n\n`.
`sources` = only the questions that were quoted.
`explanation` is always `null`.

A question printed in a paper is **never** returned as its own answer.
Only answer keys / explanatory passages that state the fact can be `answered`.

```json
{
  "status": "answered",
  "answer": "The speed of light is 3.0 × 10^{8} m/s",
  "explanation": null,
  "sources": [
    {
      "id": "light",
      "questionText": "The speed of light is 3.0 × 10^{8} m/s in vacuum.",
      "pageReference": "4",
      "score": 0.7
    }
  ]
}
```

### 7.2 `insufficient`

Related questions exist, but none states the answer.
`answer` is always the fixed string below.
`explanation` is AI-generated (or `null` if the model declined / failed).
`sources` = all related questions.

```json
{
  "status": "insufficient",
  "answer": "The uploaded papers do not contain enough information to answer this reliably.",
  "explanation": "In glucose, the carbonyl group is an aldehyde group (-CHO) at C1 in the open-chain form...",
  "sources": [
    {
      "id": "…",
      "questionText": "21 The presence of Carbonyl group in glucose is confirmed by …",
      "pageReference": "6",
      "score": 0.61
    }
  ]
}
```

### 7.3 `out_of_scope`

Nothing related (top score &lt; 0.45). Model is not called.

```json
{
  "status": "out_of_scope",
  "answer": "The uploaded papers do not contain any information about this question.",
  "explanation": null,
  "sources": []
}
```

**Errors**: shared 400s from §4; 503 also adds `Answer request failed.` · `Answer response was invalid.`

### Recommended UI call pattern (Search button)

```ts
const body = {
  query,
  subject: subject || null,
  examYear: year ?? null,
  yearFrom: timePeriod?.yearFrom ?? null,
  yearTo: timePeriod?.yearTo ?? null,
  difficulty: difficulty || null,
  limit: 10,
};

const [answer, search] = await Promise.all([
  api.answer(body),
  api.search(body),
]);

// answer → answer card (status / explanation / sources)
// search.results → "Closest exam questions" list (hide score < 0.3)
```

---

## 8. Chat — `POST /api/chat` (streaming)

Vercel AI SDK **UI Message Stream v1**. Works with `useChat` from `@ai-sdk/react`
(backend uses `ai@^7`).

Behaviour:

- The **latest user message** is the query. The last 8 earlier turns are used to
  understand follow-ups ("make it shorter", "definition" after "CO2"), so send the
  full `messages` array as `useChat` does, **including** assistant `source-document`
  parts and `metadata`. Source ids sent back are re-checked against the database;
  unknown ids are ignored.
- A request to rework the previous answer (shorter, simpler, an example, more
  detail) does not search again: it is labelled **AI-rewritten explanation**
  (or as a general explanation for examples) with `metadata.answerOrigin: "transformed"`.
- Only `text` parts are accepted in the latest user message. A `file` part → 400.
- Answer is fully verified **before** streaming; the stream only paces delivery.
- `paperTag` is accepted but **ignored**.

### 8.1 Request

`Content-Type: application/json`

```json
{
  "id": "chat-1",
  "trigger": "submit-message",
  "messages": [
    {
      "id": "u1",
      "role": "user",
      "parts": [{ "type": "text", "text": "How does glucose react with hydroxylamine?" }]
    }
  ],
  "filters": {
    "subject": "Chemistry",
    "timePeriod": "Last 5 Years",
    "difficulty": "Medium",
    "year": 2024
  }
}
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `messages` | array | **yes** | ≥1 message with `role: "user"` and a `parts` array |
| `messages[].parts[]` | `{ type: "text", text: string }` | yes | texts joined with `\n`; trimmed length 1–1000 |
| `filters` | object \| null | no | |
| `filters.subject` | string \| null | no | exact, case-sensitive; `""` = none |
| `filters.year` | integer \| null | no | 1950–2100 (**`year`**, not `examYear`) |
| `filters.difficulty` | string \| null | no | any case `easy`/`medium`/`hard`; `""` = none |
| `filters.timePeriod` | string \| null | no | `"Last N Years"` (N = 1–50) or `"All years"` / `""`. Prefer a `label` from `/questions/filters` |
| `id`, `trigger`, `messageId`, `paperTag` | any | no | ignored (sent by `useChat`) |

### 8.2 Response (success)

Status `200`, headers:

```
Content-Type: text/event-stream
x-vercel-ai-ui-message-stream: v1
```

SSE body — each event is `data: <json>\n\n`, ending with `data: [DONE]`:

```
data: {"type":"start"}
data: {"type":"start-step"}
data: {"type":"text-start","id":"text-1"}
data: {"type":"text-delta","id":"text-1","delta":"**Explanation**\n\n"}
data: {"type":"text-delta","id":"text-1","delta":"In glucose, the "}
...
data: {"type":"text-end","id":"text-1"}
data: {"type":"source-document","sourceId":"…","mediaType":"text/plain","title":"Chemistry 2024, page 6","filename":"cbse-chemistry.pdf"}
data: {"type":"finish-step"}
data: {"type":"finish","finishReason":"stop","messageMetadata":{"status":"insufficient"}}
data: [DONE]
```

| Where on assistant message | Content |
| --- | --- |
| `parts` `type: "text"` | Markdown answer (see §8.3) |
| `parts` `type: "source-document"` | `{ sourceId, mediaType, title, filename?, providerMetadata.edusearch.questionText }` — one per related/cited question. `title` is `Subject · Topic · Year · Page N`. The Markdown card only previews long questions (≈280 characters, ending in "…"); use `questionText` here for an expandable full view. |
| `metadata` | `{ status, activeSubject, kind, answerOrigin, suggestions }` — `status`: `"answered" \| "insufficient" \| "out_of_scope" \| "guidance"`; `answerOrigin`: `"knowledge_base" \| "general" \| "guidance" \| "transformed" \| "paper_questions" \| null` |
| `metadata.suggestions` | `Array<{ label, prompt }>` — follow-ups for this answer (Explain simply, Give an example, Practice questions, Related exam questions). Render as chips; on tap call `sendMessage({ text: prompt })`. Empty after greetings, refusals and clarifying questions. The reply text also ends with a "_You can also ask:_ …" line until chips exist (backend constant `SUGGESTIONS_AS_TEXT`). |

### 8.3 Markdown per status

Render with Markdown + math (`react-markdown` + `remark-math` + `rehype-katex`).
Include KaTeX CSS. Superscripts arrive as `10$^{8}$`.

**answered**

```md
> The speed of light is 3.0 × 10$^{8}$ m/s

**Sources**

1. Physics 2024, page 4 · physics.pdf
```

**insufficient + AI explanation** (usual case)

```md
**Explanation**

In glucose, the carbonyl group is an aldehyde group (\-CHO) at C1 …

_Generated by AI. Not quoted from the uploaded papers._

**Related questions from the papers**

**1. Chemistry 2024, page 6 · cbse-chemistry-xii-2024-25-sqp.pdf**

> 21 The presence of Carbonyl group in glucose is confirmed by …
```

**insufficient, no explanation**

```md
The uploaded papers do not contain enough information to answer this reliably.

**Related questions from the papers**

**1. Physics 2024, page 12 · physics.pdf**

> 5\. A ball is thrown …
```

**out_of_scope**

```md
The uploaded papers do not contain any information about this question.
```

Sources are already in the Markdown. If you also render `source-document` chips,
hide the Markdown list or accept duplication.

### 8.4 Errors

**Before stream** — `400`, `Content-Type: application/json`:

```json
{ "error": "Invalid message structure" }
```

Possible `error` values:

- `Invalid message structure`
- `File attachments are not supported yet.`
- `Message text is required.`
- `filters must be an object.`
- `filters.subject must be a string.`
- `filters.year must be a whole number from 1950 to 2100.`
- `filters.difficulty must be Easy, Medium or Hard.`
- `filters.timePeriod must be a string.`
- `filters.timePeriod must look like "Last 5 Years" or "All years".`
- `query must be at most 1000 characters.`

Other: `500 { "error": "Internal server error" }`. Malformed JSON uses the standard Nest body.

**During stream** — still HTTP `200`; stream contains:

```
data: {"type":"start"}
data: {"type":"start-step"}
data: {"type":"error","errorText":"The answer service is temporarily unavailable. Please try again."}
data: [DONE]
```

`errorText` values:

- `The answer service is temporarily unavailable. Please try again.`
- `Something went wrong while answering. Please try again.`
- or a validation message

Parse `useChat` transport errors:

```ts
function chatErrorText(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? error.message;
  } catch {
    return error.message;
  }
}
```

`stop()` closes the connection; the server stops sending.

### 8.5 React example (`useChat`)

```tsx
'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

type ChatMetadata = { status: 'answered' | 'insufficient' | 'out_of_scope' };
type ChatMessage = UIMessage<ChatMetadata>;

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function Chat() {
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState<{
    subject?: string;
    year?: number;
    timePeriod?: string;
    difficulty?: 'Easy' | 'Medium' | 'Hard';
  }>({});

  const { messages, sendMessage, status, error, stop } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: `${API}/api/chat` }),
  });

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.role === 'assistant' && m.metadata?.status === 'out_of_scope' && (
            <small>Outside the uploaded papers</small>
          )}
          {m.parts.map((part, i) => {
            if (part.type === 'text') {
              return (
                <ReactMarkdown key={i} remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {part.text}
                </ReactMarkdown>
              );
            }
            if (part.type === 'source-document') {
              return (
                <span key={i} className="chip">
                  {part.title}
                  {part.filename ? ` · ${part.filename}` : ''}
                </span>
              );
            }
            return null;
          })}
        </div>
      ))}

      {error && <p className="error">{chatErrorText(error)}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input }, { body: { filters } });
          setInput('');
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} />
        {status === 'streaming' || status === 'submitted' ? (
          <button type="button" onClick={stop}>Stop</button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </div>
  );
}
```

`filters` must be at the **top level** of the body (`sendMessage(..., { body: { filters } })`).

### 8.6 Plain `fetch` (no AI SDK)

```ts
export async function streamChat(
  text: string,
  filters: Record<string, unknown>,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
) {
  const res = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }],
      filters,
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
  }

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let status: string | undefined;
  const sources: Array<{ sourceId: string; title: string; filename?: string }> = [];

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      if (!event.startsWith('data: ')) continue;
      const data = event.slice(6);
      if (data === '[DONE]') return { status, sources };
      const chunk = JSON.parse(data);
      if (chunk.type === 'text-delta') onDelta(chunk.delta);
      else if (chunk.type === 'source-document') sources.push(chunk);
      else if (chunk.type === 'finish') status = chunk.messageMetadata?.status;
      else if (chunk.type === 'error') throw new Error(chunk.errorText);
    }
  }
  return { status, sources };
}
```

---

## 9. TypeScript types (copy into the frontend)

```ts
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QuestionType = 'MCQ' | 'SHORT' | 'LONG';

export type ApiError = { statusCode: number; message: string; error?: string };
export type ChatApiError = { error: string };

export type HealthReport = { status: 'ok'; database: 'up' };

export type SearchRequest = {
  query: string;
  subject?: string | null;
  examYear?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  difficulty?: Difficulty | null;
  limit?: number; // 1–20, default 5
};

type Counted<T> = { value: T; count: number };

export type FilterOptions = {
  subjects: Counted<string>[];
  years: Counted<number>[];
  difficulties: Counted<Difficulty>[];
  timePeriods: Array<{ label: string; yearFrom: number; yearTo: number; count: number }>;
  total: number;
};

export type SearchHit = {
  id: string;
  questionText: string;
  subject: string;
  topic: string;
  subtopic: string | null;
  examYear: number | null;
  examType: string | null;
  difficulty: Difficulty;
  questionType: QuestionType;
  sourceDocument: string | null;
  pageReference: string | null;
  score: number;
};

export type SearchResponse = { results: SearchHit[] };

export type BranchHit = {
  id: string;
  questionText: string;
  pageReference: string | null;
  rank: number;
};

export type HybridHit = BranchHit & {
  vectorRank: number | null;
  lexicalRank: number | null;
};

export type HybridSearchResponse = {
  vector: BranchHit[];
  lexical: BranchHit[];
  hybrid: HybridHit[];
};

export type CitedSource = {
  id: string;
  questionText: string;
  pageReference: string | null;
  score: number;
};

export type AnswerResponse = {
  status: 'answered' | 'insufficient' | 'out_of_scope';
  answer: string;
  explanation: string | null; // AI-generated; only meaningful for 'insufficient'
  sources: CitedSource[];
};

export type ChatFilters = {
  subject?: string | null;
  year?: number | null;
  timePeriod?: string | null; // e.g. 'Last 5 Years'
  difficulty?: 'Easy' | 'Medium' | 'Hard' | 'EASY' | 'MEDIUM' | 'HARD' | null;
};

export type ChatMetadata = { status: AnswerResponse['status'] };
```

---

## 10. Minimal REST client (student UI only)

```ts
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && (body.message ?? body.error)) || `Request failed (${res.status})`;
    throw new ApiRequestError(res.status, String(message), body);
  }
  return body as T;
}

const json = (data: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

export const api = {
  health: () => request<HealthReport>('/health', { method: 'GET' }),
  filters: () => request<FilterOptions>('/questions/filters', { method: 'GET' }),
  search: (b: SearchRequest) => request<SearchResponse>('/questions/search', json(b)),
  answer: (b: SearchRequest) => request<AnswerResponse>('/questions/answer', json(b)),
  // Experimental only — omit from the student SPA:
  // hybridSearch: (b) => request('/questions/search/hybrid', json(b)),
};
```

---

## 11. Frontend checklist

- [ ] Handle CORS (proxy or backend `enableCors`).
- [ ] Fill Subject / Time period / Difficulty / Year from `GET /questions/filters` — never hard-code.
- [ ] REST enums uppercase (`MEDIUM`). Chat accepts `Medium` / `MEDIUM`.
- [ ] Chat filter year field is `year`, not `examYear`.
- [ ] Time period → `yearFrom` + `yearTo` (REST) or `filters.timePeriod` label (chat).
- [ ] On Search: call `/questions/answer` and `/questions/search` in parallel.
- [ ] Map `status` correctly; never show `explanation` as “from the papers”.
- [ ] Hide search hits with `score` &lt; ~0.3.
- [ ] Render `^{n}` / `_{n}` in REST; render chat Markdown with KaTeX.
- [ ] Allow ≥45 s for answer and chat.
- [ ] Send the full `useChat` history (default transport does); keep assistant
      `source-document` parts and `metadata` — follow-ups depend on them.
- [ ] Attach / file upload is not supported on the student UI.
`}