# Next milestone — independent broader evaluation

**Status:** Open (blocks any hybrid / rewrite / large-embedding promotion)  
**Production:** unchanged — original-query `text-embedding-3-small` vector search  
**Ship now:** [`SHIP.md`](SHIP.md)

## Do not do yet

- Promote hybrid into `/questions/search` or `/questions/answer`
- Tune hybrid RRF weights / ranking parameters
- Test `text-embedding-3-large`
- Run another rewrite-promotion push
- Fill the promotion table with labeller (`round2`) metrics

## Exact workflow

### 1. Collect independent queries

1. Open [`student-query-form.html`](student-query-form.html) in a browser (file:// is fine).
2. Students write queries **without** seeing the bank (`sawBank: No`).
3. Click **Copy query record as JSON** and paste into [`student-queries.json`](student-queries.json) → `queries`.
4. Preserve exact wording. Target ~50 queries if practical (proposed target, not a statistical claim).

### 2. Validate (no OpenAI)

```bash
npm run validate:student-queries
```

Reports duplicate ids, contradictory labels, bad UUIDs, and `sawBank` issues. Does **not** silently drop bad records.

### 3. Label afterward

A reviewer who did not write the queries sets `label.status` to `relevant` / `no-relevant-result` / `unresolved` and confirmed UUIDs. Re-run validation.

### 4. Compare retrieval (manual live API)

Requires a running API (`EVAL_BASE_URL`, default `http://localhost:3517`) and OpenAI for embeddings.

```bash
# Labeller frozen set (not the promotion sample)
npm run eval:hybrid

# Preliminary CBSE-style candidates (NOT independent students)
npm run eval:candidate

# Independent student set (promotion sample)
npm run eval:student
```

Reports: [`hybrid-report.json`](hybrid-report.json), [`candidate-hybrid-report.json`](candidate-hybrid-report.json), [`student-hybrid-report.json`](student-hybrid-report.json).

[`candidate-paper-queries.json`](candidate-paper-queries.json) and the **100-query** set ([`CANDIDATE_100_README.md`](CANDIDATE_100_README.md)) are labeller-constructed (`sawBank: true`). Useful for exploratory comparison; **never** fill the promotion template from them.

```powershell
npm run label:candidate100
npm run eval:candidate100
```

Metrics: Recall@1, Recall@3, MRR, per-type / per-subject, improved/regressed/tied, unrelated answerability (separate from ranking).

### 5. Latency (manual live API)

```powershell
$env:EVAL_LATENCY_REPEATS = "20"
npm run eval:latency
```

Report: [`latency-report.json`](latency-report.json) — warm median/p95 and cold medians.  
Limitation: cold is “first call in each query/path series,” not a full process restart per sample.

### 6. Promotion decision

Fill [`PROMOTION_REPORT_TEMPLATE.md`](PROMOTION_REPORT_TEMPLATE.md) from the **student** and **latency** reports only.

## Mathematics

Add Maths only after representative questions are ingested and labelled. Current bank: Physics + Chemistry (68).

## Commands

| Command | Purpose | Live OpenAI? |
| --- | --- | --- |
| `npm run validate:student-queries` | Structure / label checks | No |
| `npm run eval:hybrid` | Vector vs hybrid on frozen labeller labels | Yes (manual) |
| `npm run eval:student` | Vector vs hybrid on independent student labels | Yes (manual) |
| `npm run eval:latency` | Median / p95 cold+warm | Yes (manual) |
| `npm run eval:rewrite` | Rewrite experiment only | Yes (manual) |
| `npm test` | Unit tests (validation + metrics); mocks OpenAI | No |
