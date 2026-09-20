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

### Phase 2: Goal drives the map: DONE
- Saving a goal on `/goal` runs the backend goal agent in the background (`POST /agents/goal-network`, which creates the goal **and** its plan in one call, so we do not also call `POST /goals`). The backend goal id and the text it was made from are stored on the profile (`backendGoalId`, `backendGoalText`); the agent re-runs only when the goal text changes. Concurrent requests share one run, so repeated page loads never create duplicate goals. If the backend forgot the goal (404, e.g. its database was reset) it is recreated once automatically.
- **Suggest people** button: the agent's summary, next steps and kinds of people to meet, plus people elsewhere in the shared network who fit the goal but aren't on this map, each with **Add to my map** (links to the existing record, so no duplicate-name prompt).
- **Goal views** button: how each person on the map scores against the goal (relative to the best match, with the reason), then groups by university, company, club, other organization and place (`GET /network/tracker`, filtered to this user's people).
- **Map highlight:** the top three matches glow amber and other matches get an amber outline; refreshed on load and after anyone is added.
- Backend changes (tested; suite is 42 passing): `GET /goals/{id}/graph` takes an optional `person_ids` filter so a user's own people are scored (and all returned, including zero matches); `university` now counts toward the match. Without `person_ids` the endpoint behaves exactly as before.
- Verified against the real backend: matches change when the goal changes (Berkeley-driven → robotics-driven); exactly one backend goal per distinct goal text; self-repair after a stale goal id; offline (all endpoints still answer, goal still saves, panels say what's missing, university groups still work from local data).
- **Known gaps:** people saved while the backend was offline can't be scored until they sync; match percentages are relative, not absolute; without an `OPENAI_API_KEY` the plan comes from the backend's built-in planner (the panel says which wrote it); each new goal text leaves one more goal row in the shared backend (there is no delete endpoint).

### Phase 3: Per-person actions: DONE (Research verified with a stand-in provider, see below)
Click a person → panel → action. Every per-person route checks that the caller owns the person and that the person is in the team network (`lib/person-route.ts`).
- **Research** (`/api/net/people/[id]/research`, `/questions`): reopens the last saved brief for free. **Run research is explicit, confirmed, and capped at 10/hour per user** because it calls paid providers and takes up to ~2 min. Shows facts (with the source passage), sources (only `https` links become links), warnings, and conversation starters. If several people match, it lists candidates to pick from. "Write/rewrite questions with my profile" copies the user's profile and goal into the backend's About-me record (`lib/viewer-profile.ts`, a stable UUID per user, no extra column) and asks for personalised questions; the brief id must be that person's latest, so a foreign brief can't be used.
- **Practice conversation** (`practice/turn`, `practice/feedback`): chat with the backend's rehearsal stand-in, then feedback. Works with no API keys (the backend's replies are rule-based).
- **Brain dump** (`brain-dump/extract`, `confirm`): write → review cards → save. Nothing is saved until Save. Introductions the note mentions **start unticked**, because ticking one adds a person to the shared network. Follow-ups for the person (the team's new `/follow-ups` API) are listed with Done / Snooze / Dismiss. The global Brain dump button asks who it was with, then opens the same panel.
- **Sync gate:** people saved while the backend was offline get a one-click "Add to the team network" (`POST /api/people/[id]/sync`) with the same duplicate-name confirmation as Add person. This closes the "not retried automatically" gap from phase 1.
- Names are whitespace-collapsed on save so they always match the backend's copy (research and links compare names).
- **Verified:** against the live backend for practice, brain dump, follow-ups, sync (including a real duplicate-name conflict), validation (400), ownership (404) and the not-synced gate (409); in the browser for every panel. The research service **cannot start without `FIRECRAWL_API_KEY`** (and needs `OPENAI_API_KEY`), and no keys were available, so the paid path was verified with a throwaway stand-in that returns the same response shapes. That proves our plumbing (what is sent, saved, reopened, rendered), **not** the real providers. With the service down the panel shows the backend's own message plus how to start it.
- **Not done, on purpose:**
  - *Resume prefill for "me"* (send the uploaded resume to `POST /person-data/{id}/resume` and pre-fill `/profile`): it needs the user to exist as a backend person, the research service's resume parser, and provider keys. Deferred until keys exist; the profile is used for questions today through the About-me sync above.
  - *Log a meeting* stays a placeholder (phase 5).
- **Cost/safety notes:** Brain dump confirm writes to the shared network (notes on the person; new people only if ticked). The optional research service is started with `npm run dev:all -- --research` and is non-critical: it exiting does not stop the web app or API.

### Phase 4: Ask your network: DONE
- **Ask your network** opens a chat (`POST /api/net/ask` → backend `POST /copilot/turn`). The copilot is rule-based, so it needs **no API keys** and costs nothing. The conversation (last 20 messages) is sent as history and lives in the map, so it survives opening a person and coming back.
- **Scope, chosen in the panel.** *People on my map* (default) only considers this user's own people: the backend `POST /copilot/turn` now takes an optional `person_ids` list (unchanged without it). *Everyone in the network* searches the whole shared network, **including notes other users saved**, and the panel says so. A user with nobody in the network yet gets a clear message instead of an empty answer.
- **Cited people are clickable chips** that open that person's panel. A person cited from the wider network who isn't on the map shows as a dashed **+ Name** chip that adds them (linking to the existing record) in one click.
- **Map highlight:** while the panel is open, cited people pulse cyan and the relationship threads the answer mentions (the copilot's `highlight_events` edges) are drawn solid.
- Backend changes (tested; suite is 52 passing): optional `person_ids`; `university` counts toward relevance; people with only a name and university now get a real sentence ("X is at Y") instead of an empty one and a broken opener.
- **Verified:** live backend (scoped and network answers, follow-up question with history, validation 400s); the panel in the browser (scope switch, chips, add-from-chip, glow on nodes and threads, conversation kept across panels, no overflow); isolation (a second user with an empty map can't see the first user's people).
- **Not done:** the answer's per-sentence highlight *timing* (`at_ms`, meant to sync with speech) is ignored, since answers are text; it becomes relevant with voice in phase 5.

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
