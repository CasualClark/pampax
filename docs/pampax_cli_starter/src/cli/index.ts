import { Command } from "commander";
import { migrateCommand } from "./migrate.js";
import { indexRepoCommand } from "./index_repo.js";
import { searchCommand } from "./search.js";
import { rerankCommand } from "./rerank.js";
import { uiCommand } from "./ui.js";

const program = new Command();
program
  .name("pampax")
  .description("Pampax CLI - indexing, search, and reranking tools")
  .version("0.1.0");

program.addCommand(migrateCommand);
program.addCommand(indexRepoCommand);
program.addCommand(searchCommand);
program.addCommand(rerankCommand);
program.addCommand(uiCommand);

program.parseAsync(process.argv);
