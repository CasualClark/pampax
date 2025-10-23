# Changelog — Plans Update (2025-10-22)

This bundle updates the Pampax/OAK plans to prioritize **local rerankers** as the primary Stage‑B ranking path (Cohere/Voyage become secondary/optional), adds **durable memory** primitives with session tracking, and introduces outcome‑driven retrieval tuning and explainable bundles.  
Per request: **removed prior Big‑Op #9 (multi‑repo & issue/PR integration)** from scope for now, and **moved prior Big‑Op #8 (Local Rerankers)** up in priority.

**What’s new (high‑impact):**
- Local cross‑encoder rerankers as first‑class providers with a pluggable interface
- Memory store (facts/decisions/gotchas/plans) + session/interaction tables + CLI verbs: `remember`, `recall`, `forget`, `pin`
- Outcome‑driven retrieval tuning from interaction feedback
- Query intent → retrieval policy gates
- Measured token budgeting with model‑specific tokenizers
- Code‑graph neighbors (callers/callees) for flow‑style queries
- Explainable bundles (`--md`) describing *why* each item was included
- TUI inspector tabs for Bundle, Memory, and Graph

**Explicitly out (cut):**
- Multi‑repo & issue/PR integration (parking lot).
