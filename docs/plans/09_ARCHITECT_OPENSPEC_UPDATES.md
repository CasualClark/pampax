# Architect — OpenSpec Updates for Phase 8

## Motivation
Lock the contracts so CLI, libraries, and TUI can evolve independently.

## Proposed Contracts
- **Logging record**: fields listed in Phase 8 plan with schema version.  
- **Metrics line**: `{{time, metric, value, labels...}}` JSON per line.  
- **Health JSON**: `{{ok, checks: {{name: {{ok, msg}}}}}}`.

## CLI Additions
- `pampax health`  
- `pampax cache warm|clear`  
- `--deterministic` (auto when stdout is piped)

## JSON Output Contracts
- `--json search` → list of hits with `path`, `score`, `span`, `policy`.  
- `--json assemble` → bundle entries + token tallies + stop reason.  
- `--json memory` → items by scope/kind.  
- `--json graph` → edges + symbol metadata.

## Review Checklist
- Contracts covered by tests and fixtures.  
- Backward compatible with Phase 7 outputs.
