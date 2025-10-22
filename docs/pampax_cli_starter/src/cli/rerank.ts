import { Command } from "commander";
import { makeReranker, Candidate } from "../lib/rerankers.js";
import { rrfFuse } from "../lib/rrf.js";
import fs from "node:fs";

export const rerankCommand = new Command("rerank")
  .description("Rerank candidate results using Cohere, Voyage, or local RRF fusion")
  .requiredOption("--q <query>", "Query string")
  .option("--provider <name>", "cohere | voyage | rrf", "rrf")
  .option("--model <name>", "Override model (provider-specific)")
  .option("--topK <n>", "Top K to return", "10")
  .option("--input <file>", "Candidates JSONL (id\ttext or {id,text}) or two lists for RRF: list1.json,list2.json", "")
  .action(async (opts) => {
    const topK = parseInt(opts.topK, 10);
    const provider = String(opts.provider);

    if (provider === "rrf") {
      const [a, b] = String(opts.input || "").split(",");
      if (!a || !b) throw new Error("RRF mode requires --input listA.json,listB.json");
      const listA = JSON.parse(fs.readFileSync(a, "utf-8"));
      const listB = JSON.parse(fs.readFileSync(b, "utf-8"));
      const fused = rrfFuse([ { source: "a", idsInOrder: listA }, { source: "b", idsInOrder: listB } ]);
      console.log(JSON.stringify(fused.slice(0, topK), null, 2));
      return;
    }

    const reranker = makeReranker(provider);
    if (opts.model) { (reranker as any).model = opts.model; }

    if (!opts.input) throw new Error("Provide --input with candidates");
    const text = fs.readFileSync(opts.input, "utf-8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    let candidates: Candidate[] = [];
    if (opts.input.endsWith(".json")) {
      const arr = JSON.parse(text);
      candidates = arr.map((x: any, i: number) => ({ id: x.id ?? String(i), text: x.text ?? String(x) }));
    } else {
      for (const [i, line] of lines.entries()) {
        try {
          if (line.trim().startsWith("{")) {
            const o = JSON.parse(line);
            candidates.push({ id: o.id ?? String(i), text: o.text ?? "" });
          } else {
            const [id, txt] = line.split("\t");
            candidates.push({ id: id ?? String(i), text: txt ?? "" });
          }
        } catch {
          candidates.push({ id: String(i), text: line });
        }
      }
    }
    const results = await reranker.rerank(String(opts.q), candidates, topK);
    console.log(JSON.stringify(results.slice(0, topK), null, 2));
  });
