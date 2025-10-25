# PLAN 01 — Progressive Context (CLI‑first, token‑aware)
**Updated:** 2025-10-21

## Goal
Provide *just‑enough* code and docs to an AI coding agent within a strict token budget, using staged retrieval and early‑stop heuristics. Designed to work with **one CLI** (no MCP bloat) and any OpenAI‑compatible endpoint (cloud or local).

## Non‑Goals
- Building a fleet of MCP tools
- Forcing embeddings as the only retrieval path
- IDE‑specific integration (VS Code etc.) for v1

---

## Design Overview
Progressively assemble context in **levels**, halting as soon as the agent has what it needs.

**Levels**
1) **Capsule / Outline**: file paths, module capsules (short YAML summaries), public signatures, docstrings, config keys.  
2) **Definitions**: exact symbol definitions + type signatures + nearest comments.  
3) **Implementation Spans**: smallest executable spans (function/class bodies) + nearest tests.  
4) **Full Fallback**: only if budget allows and Level 3 didn’t satisfy.

**Early‑Stop (“goal satisfied”) Heuristics**
- Query mentions a symbol and Level‑2 returns its definition **and** one usage or test.  
- Config queries return the key, default, and source file.  
- API/route queries return handler signature + router registration.  
If true → stop and emit bundle even if deeper levels are available.

---

## CLI Surface
All interactions are via a single binary **`pampax`**.

### `pampax assemble`
Hybrid retrieval (keyword/vector + graph) with progressive levels and a budget packer.

```bash
pampax assemble   --q "how does refresh token rotation work"   --budget 3500   --depth 1   --include-tests   --format json > .pampax/context.json
```

**Output (compact JSON)**
```json
{
  "bundle_id": "c_{ts}",
  "token_report": {"budget":3500,"est_used":1680},
  "items": [
    {"file":"src/auth/refresh.ts","spans":[[12,88]],"level":3,
      "why":{"seed":0.82,"edges":[["calls","validateToken",1,1.0]],"test":"tests/auth/refresh.spec.ts"}},
    {"file":"src/auth/jwt.ts","spans":[[33,96]],"level":2,
      "why":{"seed":0.61,"edges":[["imports","jwt",1,0.8]]}}
  ],
  "satisfied": true,
  "reason": "symbol definition + usage + test present"
}
```

**Flags**
- `--no-embeddings` → keyword + graph only
- `--callers` → include upstream callers
- `--top-n-seeds <k>` → seed set size (default 5)
- `--md` → human‑readable summary (optional)

---

## Budgeting & Packing
- **Estimate** tokens by per‑language averages; refine from historical measurements.  
- Greedy pack by descending relevance; when overflow → degrade item to *capsule only* (path + short summary).  
- Always return something: at minimum **file paths + reasons** so the agent can request exact lines later.

---

## Caching & Invalidation
- Cache key = `repo_HEAD_SHA + file_mtime + query_fingerprint + level`.  
- Per‑level caches (capsules, defs, spans).  
- Invalidate on file change; shard caches by language to avoid cross‑language skew.

---

## Per‑Language Tuning
- Dart/TS/JS have different average span sizes; keep **per‑language level caps** and **span merging** rules.  
- Heavier comment blocks and decorators are trimmed by default unless `--verbose-comments` is set.

---

## Error Handling & Fallbacks
- Parse failure → degrade to Level‑1 capsules.  
- Graph unavailable → vector/keyword only.  
- Budget overflow → emit capsule entries; mark `truncated: true`.

---

## Tests (v1)
- Unit: packer; early‑stop detector; cache keying; token estimator.  
- Integration: assemble on a fixture repo; assert that **Level‑2** resolves symbol queries within budget.  
- Golden tests: JSON bundles for common tasks; diff under CI.

---

## Deliverables
- `pampax assemble` command
- Capsule generator for modules (YAML)
- Early‑stop heuristics with metrics
- Tests + docs

