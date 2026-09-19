# Team ownership

Steps 1-2 are implemented in this repo and must not own Dropbox messy ingest or Elasticsearch.

| Steps | Owner | What they may do | What they must not do |
| --- | --- | --- | --- |
| 1. Goal → Network Agent | this track | Write `goals` and `goal_plans`. Call OpenAI for goal text only. | Read/write people, orgs, relationships. Call Dropbox. Call Elastic. |
| 2. Relationship Knowledge Graph | this track | READ people, orgs, relationships. Draw the full map. | Filter by goal. Rank people. Wipe SQLite. Index Elastic. |
| 3. Dynamic graph based on goal | teammates | Read `goal_plans` + the same SQLite rows. Implement `backend/app/pipeline/goal_view.py`. | Change the Goal → Network agent. |
| 4. Dropbox messy-data ingest | teammates | List/download files from `/inbox/` (or similar). Implement `pipeline/dropbox_ingest.py`. | Use `/network/*.json` demo loader as the ingest path. Wipe `goals`. |
| 5. Entity extraction | teammates | Parse files into entities. INSERT/UPDATE people, orgs, relationships. Implement `pipeline/extract.py`. | Delete the whole network on app startup. |
| 6. Elasticsearch | teammates | Index copies for search. Implement `pipeline/elastic.py`. | Make steps 1-2 depend on Elastic being up. |

## Shared SQLite contract

Steps 1-2 already use:

- `people`, `organizations`, `relationships` — source of truth for the map
- `goals`, `goal_plans` — output of the Goal → Network agent

`schema.json` is the fuller model (Project, Interest, Skill, Interaction). Teammates can add those tables. Steps 1-2 will keep working if they only add columns/tables and do not rename the existing ones.

## Dropbox folders

- `/network/*.json` — optional demo structured files. `POST /sync/dropbox` loads them **only if the network tables are empty**, unless `?force=true`.
- `/inbox/` (suggested) — messy notes/PDFs/resumes for steps 4-5. Do not put those files in `/network/`.

App startup **never** pulls Dropbox. It only seeds sample JSON when people/orgs are empty.

## APIs teammates can call

- `POST /agents/goal-network` and `GET /agents/goal-network/{id}` — goal plan
- `GET /graph` — full unfiltered map

Do not add Dropbox or Elastic calls inside `backend/app/agents/`.
