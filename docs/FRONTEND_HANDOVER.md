# Frontend handover — EduSearch AI (student UI)

Give this file **plus** [`FRONTEND_API.md`](FRONTEND_API.md) to the frontend engineer.  
That doc is the full request/response contract. This page is the short integration brief.

---

## What you are building

Student search screen (Figma): filters + query → **answer card** + **closest exam questions** list.

**Out of scope for the student SPA:** admin, PDF upload, extract/approve, hybrid search, query rewrite.

---

## Base URL & auth

| Item | Value |
| --- | --- |
| Local API | Ask backend for current `PORT` (default `3000`). Example: `http://localhost:3001` |
| Deployed API | Backend will provide the production/staging URL |
| Auth | **None** — no tokens, no cookies |
| Content-Type | `application/json` |
| Client timeout | **≥ 45 seconds** for answer / chat |

Set in the SPA env, e.g.:

```env
VITE_API_URL=http://localhost:3001
```

### CORS

- `localhost` / `127.0.0.1` (any port) → already allowed.
- Deployed SPA origin must be added by backend to `CORS_ORIGINS` (full origin, e.g. `https://app.vercel.app`).

---

## Endpoints to wire (only these)

| When | Method | Path |
| --- | --- | --- |
| App load | `GET` | `/questions/filters` |
| Search button | `POST` | `/questions/answer` |
| Search button (same time) | `POST` | `/questions/search` |
| Optional chat UI | `POST` | `/api/chat` |
| Optional health | `GET` | `/health` |

**Do not call**

- `POST /questions/search/hybrid`
- `POST /questions/search/rewritten`

---

## Screen → API map

| UI control | API |
| --- | --- |
| Subject / Time period / Difficulty / Year | Options from `GET /questions/filters` — **never hard-code** |
| Search box + Search | `POST /questions/answer` **and** `POST /questions/search` **in parallel**, same body |
| Subject | `subject` = option `value` |
| Time period | `yearFrom` + `yearTo` from chosen `timePeriods` item |
| Difficulty | `difficulty` = `EASY` \| `MEDIUM` \| `HARD` (uppercase) |
| Year | `examYear` |
| Mic | Browser Web Speech API only |
| “+” / file attach | **Not supported** — hide or disable |

---

## Search / answer request body

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

| Field | Required | Notes |
| --- | --- | --- |
| `query` | yes | 1–1000 chars, trimmed |
| `subject` | no | Exact string from filters |
| `examYear` | no | From Year dropdown |
| `yearFrom` / `yearTo` | no | From Time period |
| `difficulty` | no | `EASY` \| `MEDIUM` \| `HARD` |
| `limit` | no | 1–20; use **10** for the list |

Omit unused filters (or `null`). Filters are AND’d.

---

## What to render

### Answer card — use `status`

| `status` | Label / behaviour |
| --- | --- |
| `answered` | **“Answer from the papers”** → show `answer` + `sources` |
| `insufficient` + `explanation` | **“AI explanation (not quoted from the papers)”** → show `explanation`; list `sources` as related |
| `insufficient` + `explanation: null` | Show `answer`; list `sources` |
| `out_of_scope` | Show `answer`; **no** sources |

Never present `explanation` as text from the papers.

### Closest questions list

- Use `POST /questions/search` → `results[]`
- Fields: `id`, `questionText`, `pageReference`, `subject`, `score`, …
- Hide hits with `score` &lt; ~**0.3**
- Backend treats score ≥ **0.45** as related enough to attempt an answer

### Text notation

In `questionText` / `answer` / `explanation`: `^{8}` = superscript, `_{2}` = subscript (KaTeX or `<sup>`/`<sub>`).

---

## Minimal client (copy-paste)

Full typed version: [`FRONTEND_API.md`](FRONTEND_API.md) §10.

```ts
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (body && (body.message ?? body.error)) || `HTTP ${res.status}`,
    );
  }
  return body as T;
}

export const api = {
  filters: () => request('/questions/filters'),
  answer: (b: object) =>
    request('/questions/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    }),
  search: (b: object) =>
    request('/questions/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    }),
};

// On Search:
const body = { query, subject, yearFrom, yearTo, difficulty, examYear, limit: 10 };
const [answer, search] = await Promise.all([
  api.answer(body),
  api.search(body),
]);
```

---

## Checklist for FE

- [ ] `VITE_API_URL` (or equivalent) points at the running API
- [ ] Dropdowns from `/questions/filters` only
- [ ] Search fires **answer + search** in parallel
- [ ] REST enums uppercase (`MEDIUM`)
- [ ] Time period → `yearFrom`/`yearTo` (not the label string on REST)
- [ ] Map all three `status` values correctly
- [ ] Hide low-score search hits (~&lt; 0.3)
- [ ] Render `^{n}` / `_{n}`
- [ ] Timeout ≥ 45 s
- [ ] No hybrid / rewrite endpoints
- [ ] No file attach on student UI
- [ ] Staging/prod origin sent to backend for `CORS_ORIGINS`

---

## Live reference (backend running)

| URL | Purpose |
| --- | --- |
| `GET /demo` | Figma-style UI using the real APIs |
| `GET /playground` | Raw request/response tester |
| `GET /health` | API up check |

---

## Docs package to share

1. **This file** — `docs/FRONTEND_HANDOVER.md`
2. **Full API** — `docs/FRONTEND_API.md` (types, errors, chat streaming, examples)
3. Optional: Figma link for the search screen

Do **not** share `.env`, API keys, or admin/upload endpoints unless they also own admin.
