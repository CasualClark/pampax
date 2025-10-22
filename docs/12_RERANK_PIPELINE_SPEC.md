# 12_RERANK_PIPELINE_SPEC — Fusion & Cross-Encoder

Inputs: Stage A candidates (lexical + vectors).

- **RRF**: rank-based fusion, default k=60.
- **Cross-encoder**: Cohere/Voyage `/v1/rerank`; cap candidates; cache results.

Caching: key = hash(provider|model|query|sortedCandidateIDs).

Failures: non-zero exit; do not overwrite cache on partial responses.
