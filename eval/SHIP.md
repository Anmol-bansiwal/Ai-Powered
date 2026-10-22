# EduSearch AI — What we ship now

**Locked:** original-query vector search + `text-embedding-3-small`.  
Hybrid and query rewriting stay experimental. No larger embedding model yet.

## Production path (student UI)

1. `GET /questions/filters` — dropdowns  
2. `POST /questions/answer` + `POST /questions/search` in parallel — Search button  
3. Optional: `POST /api/chat` for streaming  

Do **not** call `/questions/search/hybrid` or `/questions/search/rewritten` from the SPA.

Reference: [`docs/FRONTEND_API.md`](../docs/FRONTEND_API.md), decision: [`RETRIEVAL_DECISION.md`](RETRIEVAL_DECISION.md).

## Team checklist

### Ready now
- [x] Answer uses vector search only (not hybrid/rewrite)
- [x] Quote / stem answerability checks in place
- [x] Frontend API doc marks hybrid as experimental
- [x] CORS enabled for local + `CORS_ORIGINS`
- [x] Latency baseline (20 repeats) — vector warm median **720 ms** / p95 **835 ms** ([`latency-report.json`](latency-report.json))
- [x] Frontend handover pack — [`docs/FRONTEND_HANDOVER.md`](../docs/FRONTEND_HANDOVER.md) + [`docs/FRONTEND_API.md`](../docs/FRONTEND_API.md)
- [ ] Frontend integrates filters + answer + search per handover
- [ ] Client demo via `/demo` or the real SPA

### Next product work (needs humans / content)
- [ ] Upload more exam papers (and answer keys if you want true `answered` quotes)
- [ ] Add Mathematics only after papers are ingested and labelled
- [ ] Collect independent student queries (`student-query-form.html` → `student-queries.json`, `sawBank: false`)
- [ ] `npm run validate:student-queries` → `npm run eval:student`
- [ ] Fill `PROMOTION_REPORT_TEMPLATE.md` before any hybrid rethink

### Do not
- Promote hybrid or rewrite into answer/chat  
- Switch to `text-embedding-3-large` without a new labelled win  
- Put candidate-100 queries into the independent student sample  
