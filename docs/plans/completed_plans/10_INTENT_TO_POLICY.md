
# Plan — Query Intent → Retrieval Policy

Map query intent to a small set of **policies** that choose seeds, depth, and stop rules.

## Intents & Policies
- **symbol** → Level‑2 defs + 1 usage + 1 test; stop when satisfied
- **config** → key + default + source file; stop early
- **api/route** → handler signature + router registration
- **incident** → callers r=1 + last N diffs touching those spans

## Implementation Outline
- Simple classifier (keywords + filetype cues + optional embedding)
- Policy JSON: tunable per repo/language
