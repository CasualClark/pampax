import { Command } from "commander";
import { openDB, ensureTables } from "../lib/db.js";

export const migrateCommand = new Command("migrate")
  .description("Apply initial SQLite schema migrations")
  .option("--db <path>", "Path to SQLite DB file", ".pampax/pampax.sqlite")
  .action((opts) => {
    const db = openDB(opts.db);
    ensureTables(db);
    console.log(`Migrations applied to ${opts.db}`);
  });
