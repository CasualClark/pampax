# Phase 8 — Acceptance Criteria & Benchmarks

**Date**: 2025-10-25

## Repo Size Tiers (guidance)
- **Medium**: ~1k–10k files / ≤ 300k LOC, single repo.
- **Large**: beyond Medium; targets are guidance, not gates.

## Latency Targets (Medium repo)

### Hybrid Search (single query)
- Warm cache: **p50 ≤ 300 ms**, **p95 ≤ 800 ms**  
- Cold cache: **p50 ≤ 700 ms**, **p95 ≤ 1.5 s**

### Bundle Assembly (typical request)
- Warm cache: **p50 ≤ 1.0 s**, **p95 ≤ 2.0 s**  
- Cold cache: **p50 ≤ 3.0 s**, **p95 ≤ 6.0 s**

### SQLite Indexed Read
- **p95 ≤ 50 ms** per op; migrations out of hot paths

### Evidence/Markdown
- Overhead **≤ 150 ms p95**

### Memory
- Steady RSS **≤ 500 MB** (Medium) during 30‑minute soak; no unbounded growth

### Cache
- **≥ 60%** hit‑rate in repeated query sessions; warm/clear commands documented

## Reliability Targets
- Deterministic CLI JSON/MD when piped; stable exit taxonomy.  
- Zero flaky tests in CI for P0 components.

## Benchmark Harness
- Fixed **benchmark corpus** in `benchmarks/medium/` and `benchmarks/large/`.  
- Scripts: `bench/run_bench.py --tier medium --trials 10 --warm` and `--cold`.  
- Output: JSON + CSV artifacts with **p50/p95**, memory profile, cache stats.  
- CI job fails on regression beyond 10% for any p95 metric vs. baseline.
