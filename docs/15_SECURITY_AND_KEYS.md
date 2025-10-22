# 15_SECURITY_AND_KEYS — Secrets & Limits

- Env vars: `COHERE_API_KEY`, `VOYAGE_API_KEY`; never log values.
- Retry/backoff for 429/5xx; cap candidates (≤ 1,000).
- Prefer Node 18+ global fetch; avoid extra deps unless needed.
