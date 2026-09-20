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

## Environment (`.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file, e.g. `file:./dev.db` (relative to `prisma/schema.prisma`) |
| `SESSION_SECRET` | iron-session cookie encryption key, 32+ chars |
| `UPLOAD_DIR` | Where resumes are stored on disk (default `uploads`, outside `/public`) |

## Pages

- `/` — landing page (Figma node 8:4). All CTAs and "Log In" go to `/login`.
- `/login` — sign up / log in (email + password).
- `/profile` — resume (PDF/DOCX, max 5 MB), work experience, projects, education, interests.
- `/goal` — free-text goal with example chips.
- `/map` — your web. Starts with one "Me" bubble; **Add person** opens a modal and `POST`s to `/api/people`.

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
