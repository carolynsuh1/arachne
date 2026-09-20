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

`npm run dev:api` starts only the backend. For **Research** on a person, also start the research service with `npm run dev:all -- --research` (copy `research-service/.env.example` to `research-service/.env` and set `FIRECRAWL_API_KEY` and `OPENAI_API_KEY`; it won't start without them, and research is paid, so it is opt-in and always asks before running). Practice conversations, Brain dump, and meeting extraction work without provider keys (meeting extraction uses its built-in reader). If the backend is down, `/map` still works with your saved people and shows a notice.

**Deepgram voice:** set `DEEPGRAM_API_KEY` in `backend/.env`, and set the same non-empty `INTERNAL_API_KEY` in both root `.env` and `backend/.env`. The browser receives only a 90-second signed voice token; it never receives either secret. The configured Deepgram Voice Agent was verified with no `OPENAI_API_KEY`: Deepgram accepted its hosted `open_ai` thinker using only the Deepgram key. `OPENAI_API_KEY` is therefore optional for voice, though other provider-backed features may still use it.

Backend tests (macOS/Linux): `cd backend && .venv/bin/python -m unittest discover -s tests -q`.

Optional shared secret: set the same `INTERNAL_API_KEY` in `.env` and `backend/.env`. The backend then rejects requests without it. Leave it empty if you also use the team's Vite app.

## Environment (`.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file, e.g. `file:./dev.db` (relative to `prisma/schema.prisma`) |
| `SESSION_SECRET` | iron-session cookie encryption key, 32+ chars |
| `UPLOAD_DIR` | Where resumes are stored on disk (default `uploads`, outside `/public`) |
| `TEAM_API_URL` | Team FastAPI backend, default `http://127.0.0.1:8000` (server-side only) |
| `INTERNAL_API_KEY` | Shared backend secret; optional for HTTP-only use, required on both sides for signed voice tokens |
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
