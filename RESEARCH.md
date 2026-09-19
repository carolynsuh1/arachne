# Coffee-chat research integration

Adds coffee-chat research as an independent service and app page. Existing graph entities and ingestion behavior are preserved.

## Run
Start three processes from these directories:

1. research-service: copy .env.example to .env, supply APIFY_TOKEN, FIRECRAWL_API_KEY, OPENAI_API_KEY and OPENAI_MODEL. Run `node --env-file=.env research-app.mjs` (Node 24). Default local port 8791.
2. backend: install requirements.txt and run `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
3. frontend: run `npm ci` then `npm run dev -- --host 127.0.0.1 --port 5173`.

Open http://127.0.0.1:5173. Research tab supports name/school search and confirmed profile URLs. Graph person nodes have Prepare coffee chat. A linked brief reloads when that same person is researched again. School is user-confirmed because the current Person table does not store it.

## Connection
React -> FastAPI POST /research -> private Node POST /api/research -> Firecrawl discovery, Apify profile data, OpenAI extraction/questions. API keys stay in research-service/.env. The Node engine is copied from the tested research tool, not called through a browser or an iframe. No local LinkedIn cookies or Chrome dependency.

Ready briefs are saved to the additive research_briefs SQLite table; graph entities and the teammates' ingestion pipeline are not overwritten. GET /research/people/{person_id} returns that person's latest brief. Unlinked searches are stored with no person ID. The brief summary is capped, but the profile view renders all normalized experience and education entries.

## Deployment
Run Node alongside FastAPI as a private service; set RESEARCH_SERVICE_URL in the Python environment to its internal URL. Node requires HOST=0.0.0.0 and PUBLIC_ORIGIN matching that URL when bound outside loopback. Keep port 8791 private. Allow >105-second requests. Configure VITE_API_URL and FastAPI CORS for the deployed frontend. Persist backend/data and private profile cache as appropriate. This repo currently has no authentication: saved briefs and paid endpoints need app authentication before public deployment.

## Verification
Frontend: npm run build. Backend: python -m unittest discover -s tests (4 tests). Research service: npm test (35 tests). Tests cover saved briefs, person mismatch, service unavailable, preservation of original person records, provider normalization, resumable runs, citation handling and URL validation.

Secrets, cache files, local database, virtual environment and node_modules are excluded from the integration ZIP.
