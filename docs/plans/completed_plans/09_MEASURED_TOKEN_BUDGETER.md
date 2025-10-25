
# Plan — Measured Token Budgeting & Packing

Replace heuristic estimates with **measured** token counts per target model.

## Features
- Model‑specific tokenizers (`--target-model`)
- Per‑repo packing profiles cached to disk
- Degrade policy: downshift items to **capsules** before dropping tests/comments

## Output Additions
```json
"token_report": { "budget": 3500, "est_used": 1680, "actual": 1612, "model": "gpt-xyz" }
```
