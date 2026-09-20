// Runs the Arachne web app (Next.js) and the team's backend (FastAPI) together, with prefixed logs.
// Ctrl+C (or either process exiting) stops both.
import { spawn } from "node:child_process";

const services = [
  { name: "web", color: "\x1b[36m", args: ["node_modules/next/dist/bin/next", "dev"] },
  { name: "api", color: "\x1b[35m", args: ["scripts/dev-api.mjs"] },
];

const children = [];
let stopping = false;

function killTree(child) {
  // On Windows child.kill() only ends the direct child, leaving grandchildren (uvicorn's reloader and
  // worker, Next's workers) running and holding the ports. taskkill /T ends the whole tree.
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill();
  }
}

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) killTree(child);
  setTimeout(() => process.exit(code), 1000);
}

for (const { name, color, args } of services) {
  const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const tag = `${color}[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let pending = "";
    stream.on("data", (chunk) => {
      const lines = (pending + chunk.toString()).split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) console.log(tag + line);
    });
  }
  child.on("exit", (code) => {
    if (!stopping) console.log(`${tag}exited with code ${code}`);
    stopAll(code ?? 0);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stopAll(0));
