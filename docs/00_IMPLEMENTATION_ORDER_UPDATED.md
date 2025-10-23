
# 00 — Implementation Order (UPDATED 2025-10-22)

> Focus change: **Local rerankers are now primary**; Cohere/Voyage are optional fallbacks.  
> Scope change: **Removed** multi‑repo & issue/PR integration from near‑term milestones.

## Phase 0 — Completed Foundation (no changes)
- Codebase prep, storage, adapters, CLI + progress UI, baseline retrieval (FTS + RRF) ✔

## Phase 1 — Local Rerankers (PRIORITY)
- Implement local cross‑encoder rerankers behind a provider interface
- CLI: `pampax rerank --provider local --model <name> --input …`
- Cache semantics preserved; deterministic JSON outputs; parity with cloud APIs

## Phase 2 — Memory Store & Session Model
- Add durable memory tables + session/interaction tracking
- CLI: `remember | recall | forget | pin`
- MCP: `memory.list/create/delete`, `context.assemble(include=['code','memory'])`

## Phase 3 — Query Intent → Retrieval Policy
- Lightweight intent classifier; policy gates for symbol/config/incident/refactor/etc.
- Early‑stop refinement; per‑intent seed mix and depth

## Phase 4 — Measured Token Budgeting
- Model‑specific tokenizers and packing profiles; degrade to capsules before dropping tests/comments

## Phase 5 — Code Graph Neighbors
- Callers/callees BFS r≤2; `--callers/--callees` flags; prefer SCIP edges when present

## Phase 6 — Outcome‑Driven Tuning
- Use interaction feedback to adjust seed weights, RRF k, and policy thresholds
- Query→bundle signature cache for recurring wins

## Phase 7 — Explainable Bundles
- `assemble --md` human‑readable rationale; explicit stopping reason and evidence table

## Phase 8 — TUI: Memory & Bundle Inspector
- Tabs: **Bundle**, **Memory**, **Graph**; copy‑pastable `--md` view

### Parking Lot
- Multi‑repo & issue/PR integration (deferred)
