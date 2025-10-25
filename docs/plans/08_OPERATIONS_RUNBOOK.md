# Operations Runbook

## Health
- `pampax health` → JSON; exit non‑zero on failure.  
- Common failures: sqlite unavailable, cache corrupted, index missing.

## Cache
- Warm: `pampax cache warm <path>`  
- Clear: `pampax cache clear --all`  
- Verify hit‑rate via metrics: target ≥ 60% during repeated sessions.

## Benchmarks
- Run: `python bench/run_bench.py --tier medium --warm --trials 10`  
- Artifacts: `bench/out/*.json` and `*.csv` uploaded by CI.

## Incidents
- Capture: save last 200 lines of structured logs + metrics snapshot.  
- Rollback: deploy previous artifact; clear caches; re‑run health.

## Configuration
- File: `pampax.toml` and env overrides. Keep secrets out of config.
