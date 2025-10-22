import { Command } from "commander";
import { Listr } from "listr2";
import { IndexProgressUI } from "../lib/progress.js";

export const uiCommand = new Command("ui")
  .description("Demo interactive CLI UI: shows an indexing session with tasks + progress bar")
  .action(async () => {
    const ui = new IndexProgressUI();
    const tasks = new Listr([
      {
        title: "Start indexer",
        task: async () => { ui.onEvent({ type: "start", totalFiles: 8 }); }
      },
      {
        title: "Parse files",
        task: async () => {
          for (const f of ["a.py","b.py","main.dart","util.dart","c.py","d.py","e.py","f.py"]) {
            await new Promise(r => setTimeout(r, 120));
            ui.onEvent({ type: "fileParsed", path: f, parsed: 0 });
            ui.onEvent({ type: "spansEmitted", path: f, count: 3 });
            ui.onEvent({ type: "chunksStored", path: f, count: 3 });
            ui.onEvent({ type: "embeddingsQueued", path: f, count: 3 });
          }
        }
      },
      {
        title: "Finalize",
        task: async () => {
          ui.onEvent({ type: "done", durationMs: 980 });
        }
      }
    ], { concurrent: false, rendererOptions: { collapse: false } });
    await tasks.run();
  });
