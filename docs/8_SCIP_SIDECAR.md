# 08_SCIP_SIDECAR.md

## Purpose
Consume `.scip` files to attach precise defs/refs/occurrences to spans.

## Reader Outline
- Read protobuf → occurrences, symbols, ranges.  
- Map to `Span` by path + byte range overlap.  
- Store edges in `reference` table.  
- Prefer SCIP refs when present; LSP otherwise.

## Acceptance
- Navigation-quality refs stored and queryable.
