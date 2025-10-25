
# Evaluation Harness — Retrieval + Memory

Goal: verify that **assemble+recall** beats **assemble alone** on time‑to‑fix and token cost.

## Setup
- 20 gold queries across a real repo
- Ground truth: target spans/files and acceptance notes

## Metrics
- Success@K (did the bundle contain the target?)
- Tokens used vs. budget
- Time‑to‑first‑good‑bundle
- Satisfaction rate (from interactions)

## Command
```bash
pampax eval --corpus fixtures/repo --queries fixtures/gold.jsonl   --modes assemble,assemble+recall --out out/eval.json
```
