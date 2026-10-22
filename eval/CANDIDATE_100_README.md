# 100 labeller-constructed candidate queries

**Not** independent student submissions. Keep separate from [`student-queries.json`](student-queries.json).

| File | Role |
| --- | --- |
| [`edusearch_100_candidate_queries.csv`](edusearch_100_candidate_queries.csv) | Source sheet |
| [`edusearch_100_candidate_queries.json`](edusearch_100_candidate_queries.json) | Pending import |
| [`edusearch_100_candidate_queries.labeled.json`](edusearch_100_candidate_queries.labeled.json) | Labelled (auto + human) |
| [`candidate100-hybrid-report.json`](candidate100-hybrid-report.json) | Vector vs hybrid report |

## Label status (current)

| Status | Count |
| --- | --- |
| `relevant` | 68 |
| `no-relevant-result` | 32 |
| `unresolved` | **0** (all nine former unresolved reviewed) |

Human resolutions (examples): rectifier `CAND-020`, pn-slab assertion `CAND-023`, gold-foil `CAND-035`, falling-body de Broglie `CAND-041`, Cassegrain 20 mm `CAND-055` → `relevant`. Aldol / solenoid / flux-emf / E–V general → `no-relevant-result`.

## Latest exploratory metrics

From [`candidate100-hybrid-report.json`](candidate100-hybrid-report.json) after human review:

| Metric | Vector | Hybrid |
| --- | --- | --- |
| Recall@1 | **0.971** | 0.956 |
| Recall@3 | 1.000 | 1.000 |
| MRR | **0.985** | 0.978 |
| Improved / regressed / tied | — | 0 / 1 / 67 |
| Negatives `out_of_scope` | 32/32 on this set | answer path unchanged |

**Conclusion:** does **not** justify promoting hybrid. Keep production vector-only.

## Commands

```powershell
npm run label:candidate100    # re-import/auto-label (overwrites auto portion — re-apply human fixes if needed)
npm run eval:candidate100
```

## Next (promotion path)

1. Collect real independent queries in `student-queries.json` (`sawBank: false`)
2. `npm run validate:student-queries` → `npm run eval:student`
3. `$env:EVAL_LATENCY_REPEATS="20"; npm run eval:latency`
4. Fill [`PROMOTION_REPORT_TEMPLATE.md`](PROMOTION_REPORT_TEMPLATE.md) from **those** reports only
