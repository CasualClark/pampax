# Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cache staleness leading to wrong bundles | High | Versioned keys; invalidate on code hash/config change; manual `cache clear` |
| Hidden latency regressions | High | CI benchmark gates; p95 alarms; golden query corpus |
| Log/metric schema drift | Med | Schema versioning; contract tests; Reviewer gate |
| SQLite contention on background indexing | Med | Use WAL; batch writes; limit concurrency; progress callbacks |
| Non‑deterministic CLI output under piping | Med | TTY detection; stable sort; disable colors/spinners |
| Incident response unclear | Med | Runbook with step‑by‑step; health checks; canned diagnostics |
