// Starts the team's FastAPI backend from backend/.venv (Windows, macOS and Linux).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const backend = path.resolve("backend");
const win = process.platform === "win32";
const python = path.join(backend, ".venv", win ? "Scripts" : "bin", win ? "python.exe" : "python");

if (!existsSync(python)) {
  console.error(
    "Backend virtualenv not found. Set it up once (Python 3.12 or 3.13 is best; 3.14 also worked):\n" +
      "  cd backend\n  python -m venv .venv\n  " +
      (win ? ".venv\\Scripts\\python" : ".venv/bin/python") +
      " -m pip install -r requirements.txt\n  cp .env.example .env",
  );
  process.exit(1);
}

const port = process.env.API_PORT || "8000";
// --reload-dir app: otherwise uvicorn also watches .venv and restarts whenever a package file changes.
const args = ["-m", "uvicorn", "app.main:app", "--reload", "--reload-dir", "app", "--host", "127.0.0.1", "--port", port];
const child = spawn(python, args, {
  cwd: backend,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
