// Runs the Arachne web app (Next.js) and the team's backend (FastAPI) together, with prefixed logs.
// Ctrl+C (or any process exiting) stops all of them.
//   npm run dev:all                 web + api
//   npm run dev:all -- --research   also the research service (needs research-service/.env and, for real
//                                   results, provider keys; research is paid, so it is opt-in)
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const services = [
  { name: "web", color: "\x1b[36m", args: ["node_modules/next/dist/bin/next", "dev"] },
  { name: "api", color: "\x1b[35m", args: ["scripts/dev-api.mjs"] },
];

if (process.argv.includes("--research")) {
  if (!existsSync("research-service/.env")) {
    console.error("research-service/.env is missing. Copy research-service/.env.example to research-service/.env first.");
    process.exit(1);
  }
  services.push({
    name: "research",
    color: "\x1b[33m",
    args: ["--env-file=.env", "research-app.mjs"],
    cwd: "research-service",
    // Optional: it exits immediately without provider keys, which must not take the web app and API down.
    optional: true,
  });
}

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

for (const { name, color, args, cwd, optional } of services) {
  const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], cwd });
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
    if (stopping) return;
    console.log(`${tag}exited with code ${code}${optional ? " (optional service; the others keep running)" : ""}`);
    if (!optional) stopAll(code ?? 0);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stopAll(0));
