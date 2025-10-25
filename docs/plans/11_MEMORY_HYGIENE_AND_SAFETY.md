
# Plan — Memory Hygiene & Safety

Keep sensitive data out of bundles and memories; keep scope tight.

## Redaction
- Mask env‑like patterns (keys/tokens/JWTs) during chunking and bundle emission
- Hash or truncate long secrets; never log values

## Scoping
- `scope`: repo | workspace | global
- Default to repo; require explicit opt‑in to broaden

## TTL & Contradictions
- Auto‑expire low‑weight or contradicted memories (recent diffs override)
