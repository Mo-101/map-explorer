import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const scriptPath = resolve("src/ingestion-workers/gfs_ingest.py");
const venvPython = resolve(".venv", "Scripts", "python.exe");

const python = existsSync(venvPython) ? venvPython : "python";
const child = spawn(python, [scriptPath], { stdio: "inherit", shell: false });

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error(`Failed to start ingest worker: ${err.message}`);
  process.exit(1);
});
