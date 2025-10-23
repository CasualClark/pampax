
# Plan — Explainable Context Bundles

Make every bundle **self‑explaining** for humans and agents.

## CLI
```bash
pampax assemble --q "refresh rotation" --budget 3000 --md > .pampax/context.md
```

## MD Output Ideas
- Evidence table (file, symbol, reason, edge type, rank, cached?)
- Stopping reason string
- Token report (budget/used/model)
