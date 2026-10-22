# EduSearch AI — Retrieval decision (current)

**Date:** 2026-10-16  
**Status:** Locked for production

## Production baseline

| Item | Decision |
| --- | --- |
| Embedding model | `text-embedding-3-small` (1536-d) |
| Query used for search | **Student original wording** (no rewrite in production) |
| Production endpoints | `POST /questions/search`, `/questions/answer`, `/api/chat` unchanged |
| Answerability | Related only if top score ≥ **0.45**; unrelated → `out_of_scope` |

## Locked decision (no production changes)

- **Production:** original-query vector search with `text-embedding-3-small`
- **Experimental:** query rewriting and hybrid retrieval
- **Deferred:** `text-embedding-3-large`, hybrid weight tuning, Mathematics until labelled
- **Ship checklist:** [`SHIP.md`](SHIP.md)  
- **Next milestone:** independent student evaluation — [`NEXT_MILESTONE.md`](NEXT_MILESTONE.md)

## Candidate 100-query evaluation (exploratory — not promotion)

Source: [`CANDIDATE_100_README.md`](CANDIDATE_100_README.md) / [`candidate100-hybrid-report.json`](candidate100-hybrid-report.json)

After human resolution of all previously `unresolved` rows (68 relevant / 32 no-relevant-result):

| Metric | Vector | Hybrid | Conclusion |
| --- | --- | --- | --- |
| Recall@1 | **higher or equal** | see latest report | Vector not worse; hybrid not justified |
| Ranking changes | — | 0 improved, ≥1 regressed (e.g. CAND-059 inertia) | No hybrid benefit demonstrated |
| Negatives rejected | Answer path `out_of_scope` on evaluated negatives | unchanged | Answerability still effective; **not** a universal guarantee |

**Do not** treat this labeller-constructed set as independent student evidence. **Do not** promote hybrid from it.

Earlier labeller `round2` / hybrid-report passes remain prototype-only.

## Independent evaluation (required before any promotion)

| Step | Command / artifact |
| --- | --- |
| Collect | [`student-query-form.html`](student-query-form.html) → [`student-queries.json`](student-queries.json) (`sawBank: false`) |
| Validate | `npm run validate:student-queries` |
| Score | `npm run eval:student` → [`student-hybrid-report.json`](student-hybrid-report.json) |
| Latency | `$env:EVAL_LATENCY_REPEATS="20"; npm run eval:latency` |
| Decide | [`PROMOTION_REPORT_TEMPLATE.md`](PROMOTION_REPORT_TEMPLATE.md) **only** from those reports |

Rewrite remains experiment-only (`npm run eval:rewrite`).

## Caveat

Physics + Chemistry bank (~68 questions). Candidate and labeller metrics are exploratory. The 28/28 (or 32/32) negative rejection rate applies only to evaluated negatives, not every possible unrelated query.
