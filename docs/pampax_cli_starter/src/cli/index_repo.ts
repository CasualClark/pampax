import { Command } from "commander";
import { IndexProgressUI } from "../lib/progress.js";

async function mockIndex(root: string, includes: string[]): Promise<void> {
  const fakeFiles = includes.length ? includes : ["src/a.py","src/b.py","lib/main.dart","lib/utils.dart"];
  const ui = new IndexProgressUI();
  ui.onEvent({ type: "start", totalFiles: fakeFiles.length });
  const t0 = Date.now();
  for (const f of fakeFiles) {
    await new Promise(r => setTimeout(r, 150));
    ui.onEvent({ type: "fileParsed", path: f, parsed: 0 });
    ui.onEvent({ type: "spansEmitted", path: f, count: 3 });
    ui.onEvent({ type: "chunksStored", path: f, count: 3 });
    ui.onEvent({ type: "embeddingsQueued", path: f, count: 3 });
  }
  ui.onEvent({ type: "done", durationMs: Date.now() - t0 });
}

export const indexRepoCommand = new Command("index")
  .description("Index a repository (shows live progress)")
  .requiredOption("--repo <path>", "Repository root path")
  .option("--include <glob...>", "Include globs (repeatable)")
  .action(async (opts) => {
    await mockIndex(opts.repo, opts.include ?? []);
  });
