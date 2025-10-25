
# CLI Checklist (Updated)

## Install & Build
```bash
pnpm install
pnpm build
```

## Initialize DB
```bash
pampax migrate --db .pampax/pampax.sqlite
```

## Index
```bash
pampax index --repo ./myrepo --include "src/**/*.py" --include "lib/**/*.dart"
```

## Search + RRF
```bash
pampax search --q "router init" --db .pampax/pampax.sqlite --k 20
pampax rerank --q "http server" --provider rrf --input out/bm25.json,out/vector.json --topK 20
```

## Local Cross‑Encoder (PRIMARY)
```bash
pampax rerank --q "configure Dart analysis server" --provider local --model bge-small   --input out/candidates.jsonl --topK 50
```

## Cloud Providers (SECONDARY, optional)
```bash
export COHERE_API_KEY=...     # or VOYAGE_API_KEY=...
pampax rerank --q "configure Dart analysis server" --provider cohere --input out/candidates.jsonl --topK 50
```
