# CI/CD & Release Plan

## Pipelines
- **Lint & Type**: ruff/flake8 + mypy; fail on warnings in P0 code.
- **Unit/Integration**: pytest with markers `p0`, `perf`, `slow`.
- **Benchmarks**: `bench/run_bench.py` on Medium corpus; compare to baseline JSON.
- **Artifacts**: store metrics JSON/CSV and logs; upload as CI artifacts.

## Gates
- No p95 regression >10% vs. baseline for search/assemble.
- Zero failed `p0` marker tests.
- `pampax health` passes in ephemeral env.

## Versioning & Release
- Semantic versions; bump minor for Phase 8.
- Release notes auto‑generated from conventional commits.
- Canary release channel; roll back via previous artifact.

## Security & Supply Chain
- Pin hashes; SLSA‑style provenance where possible.
- SBOM generation; scan for licenses and vulns.
