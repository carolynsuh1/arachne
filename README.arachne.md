# Arachne web app

Next.js (App Router) + TypeScript, plain CSS with CSS variables, Prisma + SQLite. It lives in the repo root; `frontend/`, `backend/` and `research-service/` are separate projects and are not touched.

Flow: `/` → `/login` → `/profile` (resume + background) → `/goal` → `/map`

## Run it

Requires Node.js 20+.

```bash
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
# edit .env and set SESSION_SECRET (32+ random characters):
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx prisma db push          # creates the SQLite database
npm run dev                 # http://localhost:3000
```

Production: `npm run build && npm start`.

### With the team backend (people, relationships, and later voice/research)

The map reads and writes the team's FastAPI backend (`backend/`). One-time setup (Python 3.12 or 3.13 is best; 3.14 also worked):

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
cd ..
```

Then run both together:

```bash
npm run dev:all             # web on :3000, API on :8000; Ctrl+C stops both
```

`npm run dev:api` starts only the backend. For **Research** on a person, also start the research service with `npm run dev:all -- --research` (copy `research-service/.env.example` to `research-service/.env` and set `FIRECRAWL_API_KEY` and `OPENAI_API_KEY`; it won't start without them, and research is paid, so it is opt-in and always asks before running). Practice conversations and Brain dump work without any keys. The backend works without API keys (it falls back to built-in heuristics); voice, research and meetings need the keys in `backend/.env.example`. If the backend is down, `/map` still works with your saved people and shows a notice.

Backend tests: `cd backend && .venv/Scripts/python -m pytest -q`.

Optional shared secret: set the same `INTERNAL_API_KEY` in `.env` and `backend/.env`. The backend then rejects requests without it. Leave it empty if you also use the team's Vite app.

## Environment (`.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file, e.g. `file:./dev.db` (relative to `prisma/schema.prisma`) |
| `SESSION_SECRET` | iron-session cookie encryption key, 32+ chars |
| `UPLOAD_DIR` | Where resumes are stored on disk (default `uploads`, outside `/public`) |
| `TEAM_API_URL` | Team FastAPI backend, default `http://127.0.0.1:8000` (server-side only) |
| `INTERNAL_API_KEY` | Optional shared secret sent to the backend (see above) |
| `NEXT_PUBLIC_TEAM_APP_URL` | Team's Vite app, used by "Open team app" links on `/map` |

## Pages

- `/` — landing page (Figma node 8:4). All CTAs and "Log In" go to `/login`.
- `/login` — sign up / log in (email + password).
- `/profile` — resume (PDF/DOCX, max 5 MB), work experience, projects, education, interests.
- `/goal` — free-text goal with example chips.
- `/map` — your web. Starts with one "Me" bubble; **Add person** opens a modal and `POST`s to `/api/people`, which saves the person and writes them to the team backend. Feature buttons (Talk to me, Ask your network, …) and a per-person action panel are in place; they connect to the backend in later phases (see `INTEGRATION_PLAN.md`).

`/profile`, `/goal`, `/map` redirect to `/login` when logged out, and each step redirects back if an earlier one is unfinished.

## Security notes

- Passwords hashed with bcrypt (cost 12); all input validated server-side with zod.
- Session is an encrypted, signed, `httpOnly`, `SameSite=Lax` cookie (`Secure` in production).
- State-changing API routes also reject cross-origin requests; login/signup are rate limited in memory (single process only).
- Resume uploads are checked for size, extension, MIME type and magic bytes, then saved as random filenames under `uploads/<userId>/`. That directory is git-ignored and is never served statically.

## Web-scraper hook

`app/api/people/route.ts` contains `callWebScraperStub()`, a clearly marked no-op called right after a person is saved. Wire the backend scraper in there. The scraper itself is not built.

## Assets

Icons and images exported from Figma are in `public/figma/`. Figma's asset URLs expire, so these local copies are the source of truth.
