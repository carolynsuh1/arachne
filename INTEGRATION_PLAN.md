# Integration plan: Arachne (Next.js) + team backend

Goal: one product. The Next.js app is the front door (landing, auth, onboarding, map). The team's FastAPI backend and `research-service` are the intelligence behind it.

## Where we are

| Piece | Runs on | Owns |
| --- | --- | --- |
| Arachne (`app/`, `lib/`, `prisma/`) | Next.js, `:3000` | Users, sessions, profile + resume file, goal text, people the user adds (`prisma/dev.db`) |
| `backend/` | FastAPI, `:8000` | People, organizations, relationships, goals, research briefs, meetings, brain dumps, interactions, reminders (its own SQLite) |
| `research-service/` | Node, `:8790` (`:8787` for the older `server.js`) | Public-web research, resume parsing |
| `frontend/` | Vite, `:5173` | The team's working UI for all of the above |

Facts in the team code that shape this plan (verified by reading it):

1. **No users in the backend.** No table has a `user_id`; there is no login. Everything is one shared network.
2. **Backend `Person` has only `name`.** No university. `POST /person-data` returns **409** on a duplicate name ("never silently merge people").
3. **Backend CORS only allows `localhost:5173`** (`FRONTEND_ORIGINS` env var).
4. **Voice is a websocket** (`/voice/session`, Deepgram). Browsers cannot attach our session cookie to a cross-origin websocket, so it needs a token.
5. **Keys live server-side**: `OPENAI_API_KEY`, `DEEPGRAM_API_KEY` (backend); `APIFY_TOKEN`, `FIRECRAWL_API_KEY`, `OPENAI_API_KEY` (research-service).

## Decisions

Settled:
1. **Source of truth = the backend.** Prisma keeps only users, sessions, profile, and a per-user list of which backend people are on that user's map (`Person.backendPersonId`).
2. **Shared demo network for now.** All users share one backend network; each user's map is a *view* of it (only the people that user added). Per-user ownership is phase 6.
3. **`Person.university` added to the backend.** Done (with an automatic column migration for existing databases).

Still open:
4. **What happens to the Vite app?** Recommendation: keep it as the "power tools" app until each page is ported, then retire it. The **Open team app** links on `/map` point at it.
5. **Which research entry point?** Recommendation: go through `backend/routers/research.py` (`POST /research`), so the browser never talks to `research-service`.

## Architecture

```
Browser ──► Next.js (:3000)  ── session cookie checked here
              │  /api/net/* proxy routes (server-side only)
              ▼  X-Internal-Key + X-User-Id headers
           FastAPI (:8000) ──► research-service (:8790)
              ▲
Browser ══ websocket (voice) using a short-lived token minted by Next
```

- Next API routes are the only thing the browser calls. They check the session, then call FastAPI. The backend is never exposed to the browser, except the voice websocket.
- The backend trusts requests only if they carry a shared secret (`INTERNAL_API_KEY`). It reads `X-User-Id` for scoping once phase 6 lands.
- One small client module (`lib/team-api.ts`) holds the base URL, secret, timeouts and error mapping, so routes stay thin.

## Phases

Each phase ends with something demoable. The **Phase** column in `lib/features.ts` matches these numbers, and the side panel on `/map` shows it.

### Phase 0: Run everything together: DONE
- `npm run dev:all` (`scripts/dev-all.mjs`) starts Next (`:3000`) and the FastAPI backend (`:8000`, from `backend/.venv`) with prefixed logs. If either side dies, the launcher stops the whole process tree on Windows, so no orphaned servers hold the ports. `npm run dev:api` and `npm run dev:research` start pieces on their own. (`research-service` is not in `dev:all` because it needs paid API keys.)
- Backend CORS now allows `:3000`.
- `TEAM_API_URL` and an optional `INTERNAL_API_KEY` (backend guard in `backend/app/internal_key.py`, off unless set, so the Vite app is unaffected). Verified: without the key the backend returns 401 except `/health` and CORS preflights; the Next app sends the key.
- Health check: `GET /api/net/health` → backend `/health`.
- UI shell: feature buttons and side panels on `/map`.

### Phase 1: The map reads the real network: DONE (with the deviations below)
- `lib/team-api.ts` (server-side client with timeout and error mapping), `lib/network.ts`, `GET /api/net/graph`.
- **Add person writes through** to `POST /person-data` with the university, and stores the returned id as `Person.backendPersonId`.
- **Duplicate names (backend 409):** the modal asks "is this the same person?" and, on yes, links to the existing record (server re-checks the id and name match, so an id can't be forged). Someone already on your own map is refused.
- **Backend offline:** adding still works and is saved locally (`synced: false`); the map shows a notice. Verified by stopping the backend.
- **Relationships:** backend edges between people on your map are drawn as dashed amber threads next to the cyan contact threads.
- Backend changes (tested, `backend/tests/test_arachne_integration.py`; suite is 38 passing): `Person.university`, `ensure_columns()` migration, `university` in `/person-data` and `/graph` nodes.
- **Deviations from the first draft of this plan:**
  - The map does **not** show the whole shared graph. The backend seeds 8 sample people, which would break "starts with exactly one bubble". It shows only people the user added, plus edges among them.
  - The backend's own `/graph` layout is ignored (it's one big ring of everyone); we keep our ring layout, which now adapts to the canvas width so outer rings aren't clipped.
  - The scraper hook is still a marked stub and is **not** called on every add: `POST /research` uses paid providers (Apify, Firecrawl, OpenAI). It becomes the per-person Research button in phase 3.
- **Known gaps:** people saved while the backend was offline are not retried automatically (a "sync now" action is a small follow-up); existing sample people linked from the network keep the university the backend has for them (empty for seed data); no edge types beyond "recommends chat"/"suggested intro" are shown.
- **Done when:** people added on `/map` appear in the team's Vite graph. Verified for the backend record and university; the reverse direction (Vite-created people appearing on a user's map) is by design not automatic, since a map only shows people the user added.

### Phase 2: Goal drives the map
- `/goal` submit also calls `POST /goals` and `POST /agents/goal-network`; store `backendGoalId`.
- **Suggest people** button → shows sub-goals and target profiles from the plan.
- **Goal views** button → `GET /goals/{id}/graph` and `GET /network/tracker` (group by company, club, area); highlight matching people on the map.
- **Done when:** changing the goal changes which nodes are highlighted.

### Phase 3: Per-person actions (text-based)
Click a person → panel (already built). Wire up each action:
- **Research** → `/research` + question generation (`/research/briefs/{id}/questions`).
- **Practice conversation** → `/copilot/practice/turn` + `/feedback` (chat UI in the panel).
- **Brain dump** → `/brain-dumps/extract`, review, `/confirm`; reminders via `/brain-dumps/reminders`.
- Resume: send the uploaded resume to `POST /person-data/{id}/resume` (or the resume parser) for **me**, and pre-fill `/profile` fields from the result.
- **Done when:** each action works end to end for a person on the map.

### Phase 4: Ask your network
- **Ask your network** → `POST /copilot/turn` with history; chat panel; cite people as clickable chips that select the node.

### Phase 5: Voice and live meetings
- **Talk to me**: Next mints a short-lived signed token (`/api/voice-token`); browser opens `WS /voice/session?mode=network&goal_id=…&token=…`; backend verifies the token before proxying to Deepgram. Needs mic permission UI and reconnect handling (the backend already sends `reconnectable`).
- **New meeting / Log a meeting**: `/meetings` create, stream audio chunks (`/chunks`), pause/resume/end, then **confirm** what was learned (`/confirm`). "Ask meetings" via `/meetings/ask/query`.
- **Done when:** a spoken conversation and a recorded meeting both update the map.

### Phase 6: Multi-user and hardening
- Add `owner_id` to backend tables; enforce from `X-User-Id`; migrate existing rows.
- Tests: Next route tests with a mocked backend; one end-to-end path per phase. The backend already has tests for most routers.
- Rate limits and size limits on proxy routes; timeouts and clear error states in the UI.
- Deployment plan (three services) and secrets handling.

## Risks

- **Voice/meetings need real keys** (Deepgram, OpenAI) and a mic; can't be verified without them.
- **Two auth models.** Until phase 6, anyone who can reach `:8000` directly can read the network; keep it bound to localhost in dev and behind the internal key in any shared environment.
- **Backend has no migrations** (SQLite created from models); schema changes need a reset or a hand migration.

## Open questions for the team

1. Which API keys are available for the demo (OpenAI, Deepgram, Apify, Firecrawl)? Phases 3, 4 and 5 depend on them.
2. Is `research-service` deployed separately, or should the backend own it?
3. Should the seeded sample people stay in the shared network, or be removed for the demo?
4. OneDrive: the repo lives in a OneDrive folder, and Next's `.next` cache was corrupted once (`EINVAL … readlink`). Exclude `.next/` and `node_modules/` from sync, or keep the repo outside OneDrive.
