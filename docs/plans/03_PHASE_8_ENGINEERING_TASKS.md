# Phase 8 — Engineering Task Board (Bite‑Sized)

Legend: **Size** S/M/L; **Owner** = primary agent; **Deps** list blocking items.

| ID | Task | Size | Owner | Deps | Notes |
|----|------|------|-------|------|------|
| P0-OBS-1 | Add structured logging wrapper and schema | M | Engineer | — | Replace print/logging calls across components |
| P0-OBS-2 | Emit metrics for search/assemble/cache/sqlite/errors | M | Engineer | P0-OBS-1 | Expose as JSON line per op |
| P0-OBS-3 | `pampax health` command | S | Builder | P0-OBS-2 | JSON output, non-zero exit on failing checks |
| P0-CACHE-1 | Introduce cache key schema + storage adapter | M | Database | — | Namespaced keys; versioned |
| P0-CACHE-2 | Read‑through cache in search pipeline | M | Engineer | P0-CACHE-1 | Record hits/misses |
| P0-CACHE-3 | Read‑through cache in bundle assembly | M | Engineer | P0-CACHE-1 | Signature hashing |
| P0-CACHE-4 | CLI: `cache warm/clear` commands | S | Builder | P0-CACHE-1..3 | Arg parsing + progress |
| P0-PERF-1 | Timeouts, retries, backoff policies | S | Engineer | — | Circuit breaker for provider calls |
| P0-PERF-2 | Query/index/sql tuning checklist | M | Database | — | Index hints, analyze, vacuum |
| P0-UX-1 | Deterministic JSON/MD output mode | S | Builder | — | Disable spinner/TTY noise when piped |
| P0-UX-2 | Config file `pampax.toml` + env overrides | S | Builder | — | Defaults + docs |
| P0-DOC-1 | Production runbook | S | Knowledge | All P0 | Incidents, rollbacks, cache hygiene |
| P0-BENCH-1 | Benchmark corpus + harness | M | Knowledge | Engineer | Datasets + run scripts |
| P0-BENCH-2 | CI wiring + regression thresholds | S | DevOps | P0-BENCH-1 | Save artifacts, fail on regressions |
| P1-SEARCH-1 | Relevance tuning flags + golden queries | M | Architect | P0-OBS-2 | Add testcases + switches |
| P1-SEARCH-2 | Advanced filters (path/type/owner) | M | Engineer | P0-OBS-2 | Query planner update |
| P2-INDEX-1 | Background indexing + incremental refresh | L | Database | P0-OBS-2 | Avoid UI stalls; locks |
| P2-ANALYTICS-1 | Usage export CSV/JSON | S | Builder | P0-OBS-2 | Opt-out flag, privacy check |

## Agent Routing
- **Orchestrator**: maintains this board, resolves deps, slices tasks.  
- **Architect**: P1 search strategy, golden corpus design, OpenSpec updates.  
- **Engineer**: Observability, caching in code paths, performance guards.  
- **Frontend**: N/A for Phase 8 (reserved for Phase 9 TUI).  
- **Builder**: CLI commands & deterministic output; glue and UX polish.  
- **Database**: Cache store, schema/index tuning, background indexing.  
- **Generalist**: Small fixes; log/metric adapters, doc polish.  
- **Reviewer**: Enforces standards/linters/tests before merge.  
- **Knowledge**: Benchmarks, runbook, docs; collects metrics into guides.  
- **DevOps**: CI jobs, artifacts, release gates, versioning.
