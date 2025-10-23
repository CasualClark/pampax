
# Plan — Outcome‑Driven Retrieval Tuning

Close the loop using session outcomes to **learn** better retrieval behavior over time.

## Signals
- `interaction.satisfied` (0/1), `time_to_fix_ms`, `top_click_id`
- Query → successful bundle **signature** cache

## Adjustments
- Seed mix weights (lexical/vector/graph) and RRF `k`
- Early‑stop thresholds per intent
- Diversification knobs to avoid bunching

## Batch Job (cron or CLI)
```bash
pampax learn --from-sessions 30d --update-weights   --write out/policy.json --dry-run=false
```

## Reports
- Win rate by intent / language / repo
- Token cost vs. satisfaction curves
- Before/after diffs for weights and policy gates
