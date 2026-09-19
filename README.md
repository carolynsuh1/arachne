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

Teammate-owned Dropbox ingest, entity extraction, Elastic, and goal-specific graph views live in `backend/app/pipeline/` and are documented in `TEAM.md`.

## What this version does

1. **Goal → Network Agent** (`backend/app/agents/goal_network.py`)
   - You type a goal.
   - It breaks that into subgoals and the kinds of people to know next.
   - Uses OpenAI if `OPENAI_API_KEY` is set; otherwise a built-in fallback so the demo still runs.

2. **Relationship Knowledge Graph** (`backend/app/agents/knowledge_graph.py`)
   - Nodes: people, organizations/labs, interests, and the current goal.
   - Edges: knows, member-of, interested-in, introduced-by, needed-for.
   - Reads SQLite (filled from Dropbox or local sample). If a goal plan exists, it ranks who matters.

## What this version does

1. You type a goal on the web page. The backend saves it in SQLite.
2. A sample Berkeley AI network is shown as a graph (people, orgs, relationships).
3. If you set a Dropbox token, the same three JSON files can be loaded from Dropbox instead of the local sample.

There is no login, no ranking AI, and no deployment yet.

## Folder map

- `frontend/` — React + Vite + Tailwind + React Flow. This is the page you open.
- `backend/app/main.py` — FastAPI app, CORS, startup sync.
- `backend/app/models.py` — SQLite tables: Person, Organization, Goal, Relationship.
- `backend/app/dropbox_client.py` — downloads `/network/*.json` from Dropbox.
- `backend/app/ingest.py` — writes those JSON files into SQLite.
- `backend/sample_data/` — the same JSON you can upload to Dropbox.

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

See `TEAM.md` before adding Dropbox or Elastic code. This track does not ingest messy files and will not overwrite a network that already has rows.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/goals` | Save a goal |
| GET | `/goals` | List saved goals |
| POST | `/agents/goal-network` | Decompose a goal into subgoals and needed connections |
| GET | `/agents/knowledge-graph` | Full relationship map (no goal filter) |
| GET | `/graph` | Same map, used by the frontend |
| POST | `/sync/dropbox` | Demo JSON only; 409 if SQLite already has a network |
| POST | `/sync/sample` | Local sample only; 409 if SQLite already has a network |
