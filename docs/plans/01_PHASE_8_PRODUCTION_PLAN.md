# Phase 8 — Advanced Features & Production Readiness

**Status**: Phase 7 complete; repo clean and integrated.  
**Decision**: Phase 8 = production features first; TUI Inspector follows as Phase 9.  
**Date**: 2025-10-25

---

## Goals

1) **Reliability & Observability**: Structured logging, metrics, and health checks so failures are diagnosable and visible.  
2) **Caching**: Read‑through cache for search and bundle assembly; warm/clear commands.  
3) **Performance**: Meet p50/p95 targets for search and bundle assembly on Medium repos.  
4) **Operator UX**: Deterministic CLI outputs for CI, clear exit codes, config with sensible defaults.  
5) **Docs & Runbooks**: Make production operation boring—in the good way.

## Out of Scope (defer to early Phase 9/10)

- Fancy relevance tuning UI/flags beyond P1 below.  
- Multi‑repo and issue/PR integrations.  
- TUI Inspector (moved to Phase 9 per plan).

## Workstreams & Exit Criteria

### P0 — **Production Gate** (ship when all pass)
- **Observability**
  - Structured logs with stable schema: `time`, `level`, `component`, `op`, `corr_id`, `duration_ms`, `status`, `msg`, `err_code`, `err_kind`.
  - Metrics: `search_latency_ms`, `assemble_latency_ms`, `cache_hit_ratio`, `index_refresh_ms`, `sqlite_read_ms`, `errors_total{kind}`.
  - Health endpoint/command: `pampax health` returns JSON and non‑zero on failure.
- **Caching**
  - Read‑through cache for search results and bundle plan signatures.
  - `pampax cache warm <path|repo>` and `pampax cache clear [--all|--scope search|bundle]`.
  - Cache stores versioned keys; safe to invalidate on build/version change.
- **Performance**
  - Medium repo latency targets (see acceptance file) met at p50/p95 for cold/warm states.
  - Timeouts/backoffs on external calls; memory stable in 30‑minute soak.
- **Operator UX**
  - Deterministic CLI output when piped (no TTY adornments); stable non‑zero exit codes on failure classes.
  - Config file `pampax.toml` supports env overrides; defaults documented.
- **Docs**
  - Runbook for deploy, rollbacks, cache hygiene, and incident steps.
  - Benchmark methodology and corpus checked into `benchmarks/`.

### P1 — **Polish**
- Advanced search toggles: intent/policy knobs, additional filters.  
- Relevance calibration harness; golden queries corpus.  
- SQLite/query tuning playbook and index analyzer script.

### P2 — **Scalability**
- Backgroundable indexing; incremental refresh avoids full re‑index.  
- Optional analytics export (CSV/JSON) for usage patterns.  

## Deliverables
- Code + tests, CLI commands (`health`, `cache warm|clear`), config, metrics emitters, benchmark suite, ops runbook, PRD checklists.
- Dashboards: text‑mode summaries from metrics JSON; CI artifacts attached.

## Dependencies
- None blocking; reuse Phase 7 explainable bundle scaffolding for evidence and timing capture.
