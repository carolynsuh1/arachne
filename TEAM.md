# Team ownership

Steps 1-2 are implemented in this repo and must not own Elasticsearch.

| Steps | Owner | What they may do | What they must not do |
| --- | --- | --- | --- |
| 1. Goal → Network Agent | this track | Write `goals` and `goal_plans`. Call OpenAI for goal text only. | Read/write people, orgs, relationships. Call Elastic. |
| 2. Relationship Knowledge Graph | this track | READ people, orgs, relationships. Draw the full map. | Filter by goal. Rank people. Wipe SQLite. Index Elastic. |
| 3. Dynamic graph based on goal | teammates | Read `goal_plans` + the same SQLite rows. Implement `backend/app/pipeline/goal_view.py`. | Change the Goal → Network agent. |
| 4. Entity extraction | this repo | `POST /pipeline/extract` calls Terra and upserts SQLite. Seed from `backend/sample_data/`. | Delete the whole network on app startup. |
| 5. Elasticsearch | teammates | Index copies for search. Implement `pipeline/elastic.py`. | Make steps 1-2 depend on Elastic being up. |

## Shared SQLite contract

Steps 1-2 already use:

- `people`, `organizations`, `relationships` — source of truth for the map
- `goals`, `goal_plans` — output of the Goal → Network agent

App startup seeds sample JSON when people/orgs are empty. New people can also be upserted with `POST /pipeline/extract`.

## APIs teammates can call

- `POST /agents/goal-network` and `GET /agents/goal-network/{id}` — goal plan
- `GET /graph` — full unfiltered map
- `POST /pipeline/extract` — messy text → Terra → upsert people/orgs/relationships

Do not add Elastic calls inside `backend/app/agents/`.
