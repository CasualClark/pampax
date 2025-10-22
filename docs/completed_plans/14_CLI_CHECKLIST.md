# 14_CLI_CHECKLIST — Build, Run, Verify

- Build: `pnpm install && pnpm build`
- Migrate: `pampax migrate --db .pampax/pampax.sqlite`
- Index: `pampax index --repo ./myrepo --include "src/**/*.py" --include "lib/**/*.dart"`
- Search: `pampax search --q "router init" --k 20`
- RRF: `pampax rerank --q "http server" --provider rrf --input out/bm25.json,out/vector.json --topK 20`
- Cohere/Voyage: export keys and run `rerank --provider cohere|voyage`
