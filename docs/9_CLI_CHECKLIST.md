# 09_CLI_CHECKLIST.md

## Install & Build
```bash
pnpm install
pnpm build
```

## Initialize DB
```bash
pampax migrate --db .pampax/pampax.sqlite
```

## Index (with live UI)
```bash
pampax index --repo ./myrepo   --include "src/**/*.py"   --include "lib/**/*.dart"
```

## Search (lexical baseline)
```bash
pampax search --q "router init" --db .pampax/pampax.sqlite --k 20
```

## Rerank
```bash
# Local RRF (two ranked lists of IDs)
pampax rerank --q "http server"   --provider rrf   --input out/bm25_top.json,out/vector_top.json   --topK 20

# Cross-encoder (set one of these keys first)
export COHERE_API_KEY=...     # or VOYAGE_API_KEY=...

pampax rerank --q "configure Dart analysis server"   --provider cohere   --input out/candidates.jsonl   --topK 50
```

## UI Demo
```bash
pampax ui
```
