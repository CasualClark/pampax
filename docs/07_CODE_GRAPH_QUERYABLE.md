
# Plan — Queryable Code Graph (Callers/Callees)

Expose a light graph of `call`, `import`, `test-of`, `routes`, `config-key` edges and use it to expand bundles when the query implies **flow**.

## Inputs
- LSP (`definition`, `references`, `documentSymbol`)
- SCIP sidecar when available (preferred for precision)

## CLI
```bash
# Include graph neighbors
pampax assemble --q "how does X reach Y" --callers 1 --callees 1 --budget 3000
```

## Storage
- `reference` table for edges (already present) + optional `edge` summary table
- Graph stats: in/out degree per symbol to guide diversification

## Behavior
- BFS expansion r≤2 with token guard
- Prioritize high‑precision edges (SCIP), then LSP, then heuristics
