# Hybrid promotion decision — independent student set

Fill **only** from `eval/student-hybrid-report.json` and `eval/latency-report.json`.  
Do **not** paste the labeller `round2` / 42-query results here.

| Evaluation | Vector baseline | Hybrid candidate |
| --- | --- | --- |
| Independent positive queries (n) | | |
| Recall@1 | | |
| Recall@3 | | |
| MRR | | |
| Unrelated correctly rejected (`out_of_scope` or `insufficient`) | | |
| Answered false positives on unrelated | | |
| Median latency (warm) | | |
| p95 latency (warm) | | |
| Queries improved | | |
| Queries regressed | | |
| Queries tied | | |

## Per-category Recall@1 (from report `retrieval.byType`)

| Category | Vector | Hybrid | n |
| --- | --- | --- | --- |
| | | | |

## Promotion gate (all required)

- [ ] Repeatable lift in Recall@1 and/or MRR on the **independent** set
- [ ] No material regression in important categories
- [ ] No increase in unrelated queries treated as `answered`
- [ ] Acceptable median and p95 latency (`npm run eval:latency`)
- [ ] Reproducible on this frozen student-query set
- [ ] Hybrid weights **not** tuned against this set after freezing

**Decision:** ☐ Hold (production unchanged) · ☐ Promote hybrid (separate change request)

Date: __________  Reviewer: __________
