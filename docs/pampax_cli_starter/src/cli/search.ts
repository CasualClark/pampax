import { Command } from "commander";
import { openDB, ftsSearch } from "../lib/db.js";

export const searchCommand = new Command("search")
  .description("Search chunks via FTS (BM25-like) and print JSON")
  .requiredOption("--q <query>", "Query string")
  .option("--db <path>", "SQLite DB", ".pampax/pampax.sqlite")
  .option("--k <n>", "Results to return", "20")
  .action((opts) => {
    const db = openDB(opts.db);
    const rows = ftsSearch(db, opts.q, parseInt(opts.k, 10));
    console.log(JSON.stringify(rows, null, 2));
  });
