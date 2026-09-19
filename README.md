# YourWeb

Goal-oriented personal network agent for HackMIT.

Instead of listing everyone you know, YourWeb starts from a goal and shows a relationship graph of people and organizations that can help.

## The two agents (this track)

1. **Goal → Network Agent** (`backend/app/agents/goal_network.py`)
   - You type a goal.
   - It breaks that into subgoals and the kinds of people to know next.
   - Uses OpenAI if `OPENAI_API_KEY` is set; otherwise a built-in fallback so the demo still runs.
   - Writes only `goals` and `goal_plans`.

2. **Relationship Knowledge Graph** (`backend/app/agents/knowledge_graph.py`)
   - Nodes: people, organizations/labs, interests.
   - Edges: knows, member-of, interested-in, introduced-by, and whatever is already in SQLite.
   - Reads SQLite only. Does not rank or hide people by goal.
   - SQLite is filled from `backend/sample_data/` on first boot, or by `POST /pipeline/extract`.

3. **Goal Views Dashboard**
   - Select any saved goal to generate a locally matched people graph.
   - Sort people by name, company, or geographic area.
   - Track companies, clubs, organizations, and location coverage.

Entity extraction, Elastic, and goal-specific graph views live in `backend/app/pipeline/` and are documented in `TEAM.md`.

There is no login and no deployment yet.

## Folder map

- `frontend/` — React + Vite + Tailwind + React Flow. This is the page you open.
- `backend/app/main.py` — FastAPI app, CORS, startup seed.
- `backend/app/models.py` — SQLite tables: Person, Organization, Goal, Relationship.
- `backend/app/ingest.py` — writes network JSON into SQLite.
- `backend/sample_data/` — local sample people, orgs, and relationships.

## Run locally

You need two terminals.

### Backend

Use Python 3.12 or 3.13 if you can (`python3.12 -m venv .venv`). Very new 3.14 installs can fail on older Pydantic wheels.

```bash
cd backend
python3.12 -m venv .venv || python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/health to confirm it is running.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

See `TEAM.md` for Elastic ownership. `POST /pipeline/extract` can turn messy text into SQLite rows without wiping the graph.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/goals` | Save a goal |
| GET | `/goals` | List saved goals |
| POST | `/agents/goal-network` | Decompose a goal into subgoals and needed connections |
| GET | `/agents/knowledge-graph` | Full relationship map (no goal filter) |
| GET | `/graph` | Same map, used by the frontend |
| GET | `/goals/{id}/graph` | People graph locally matched to a saved goal |
| GET | `/network/tracker` | People grouped by company, club, organization, and location |
| POST | `/sync/sample` | Load local sample JSON; 409 if SQLite already has a network |
| POST | `/pipeline/extract` | Messy text → Terra → upsert people/orgs/relationships |
