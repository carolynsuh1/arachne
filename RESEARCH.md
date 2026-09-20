# Research, resumes, and personal profiles

## What the team gets

- Research a person by name/school or a confirmed LinkedIn URL. Apify retrieves professional profile data; Firecrawl searches and retrieves public web pages. Claims require source evidence and identity checks. Retrieved links are not automatically verified facts.
- Save research versions and parsed resumes against an existing graph person, or create a person from Research. Reopening a person loads saved history.
- Create/select/edit a personal profile. Import your own LinkedIn experience and education, review it, and save it. Goals, interests, and contribution remain manually entered.
- Generate coffee-chat questions using the selected profile's detailed background and the researched person's supported facts. Regenerate without scraping again; older versions remain saved.
- Keep the existing Goal views dashboard, coverage tracking, knowledge graph, and Elasticsearch work from main.

## Architecture

React calls FastAPI, which calls a private Node research service. Provider keys remain on the server.

`React -> FastAPI -> Node -> Apify / Firecrawl / OpenAI`

SQLite at `backend/data/app.db` stores graph people, research briefs, resume records, and personal profiles. Browser localStorage stores only the selected profile ID. New tables are created at startup; this feature does not replace existing graph tables. Each teammate's local database is separate unless everyone uses the same hosted backend.

Question generation uses `gpt-5.6-luna` with low reasoning by default. One call drafts six candidates and a second reviews them. The pipeline selects connection/advice/story questions after citation, profile excerpt, length, and format checks. Full imported work descriptions and dates are supplied, bounded to 14k characters. Edit `research-service/question-prompts.js` to tune writing/review behavior. This is prompt engineering, not model training. Extraction and resume parsing use `OPENAI_MODEL` separately.

## Local setup

Use Node 24 and Python 3.11+. Start three terminals:

1. In `research-service`, copy `.env.example` to `.env`. Set `APIFY_TOKEN`, `FIRECRAWL_API_KEY`, `OPENAI_API_KEY`, and `OPENAI_MODEL`. Keep `OPENAI_QUESTION_MODEL=gpt-5.6-luna`. Run `node --env-file=.env research-app.mjs` (port 8791).
2. In `backend`, install `pip install -r requirements.txt`, then run `uvicorn app.main:app --host 127.0.0.1 --port 8000`. Follow the main README for the team's other backend provider settings.
3. In `frontend`, run `npm ci`, then `npm run dev -- --host 127.0.0.1 --port 5173`.

Open http://127.0.0.1:5173. For different ports set backend `RESEARCH_SERVICE_URL` and `FRONTEND_ORIGINS`, plus frontend `VITE_API_URL`. Default backend CORS allows localhost/127.0.0.1 on port 5173.

No API keys, personal databases, cached profiles, or PDFs are included in Git. Supply keys privately in environment variables. Your teammate will not receive your saved personal profile by pulling this branch.

## Demo walkthrough

1. Open Profiles, create a profile, optionally import LinkedIn, review and save. Add interests and a goal.
2. Open Research, select or create the person you want to meet, and research their public profile.
3. Inspect experience, education, source evidence, and web coverage. Expand Why this fits you under a question.
4. Upload a text resume for that selected person and reopen their history.
5. Change your profile, save, and regenerate questions on an existing brief. This creates a new saved version without another scrape.

## API map

| Route | Purpose |
| --- | --- |
| `POST /research` | Research and save a brief, optionally linked to a person |
| `GET /research/people/{id}` | Latest brief for a person |
| `POST /research/briefs/{id}/questions` | New question version using viewer_profile_id and goal |
| `GET /person-data` / `POST /person-data` | List/create graph people |
| `GET /person-data/{id}` | Saved research and resume history |
| `POST /person-data/{id}/research/{brief_id}` | Attach an unlinked, name-matching brief |
| `POST /person-data/{id}/resume` | Parse/save a raw application/pdf request body |
| `GET /my-profile` | List shared profiles |
| `GET /my-profile/{id}` / `PUT /my-profile/{id}` | Read/save a profile |
| `POST /my-profile/import-linkedin` | Preview imported professional background |

## Limits and remaining work

- Profiles are shared workspace records, not authenticated accounts. Authentication and ownership checks are required before public access to profiles, resumes, or paid research endpoints.
- Text PDFs only, up to 10 MB / 12 pages. Original PDF bytes are not retained; parsed fields and extracted source lines are stored. Scanned PDFs need OCR. Matching a name is not proof of identity.
- Resume records are saved alongside the person; uploading one does not automatically merge it into the researched facts or the viewer's profile/question context.
- LinkedIn availability depends on Apify. Web retrieval can fail, and incomplete pages can yield no verified facts. Sources are not guaranteed complete.
- Questions remain suggestions. Source checks do not guarantee a natural or useful conversation; the career question can still lean toward resume advice.
- Deploy Node privately alongside FastAPI, persist SQLite and provider cache, configure CORS, and allow long requests (research >105 seconds, resume up to 260 seconds). A frontend-only deployment does not host this entire system.

## Verified on the combined branch

Frontend `npm run build` passed; Node `npm test`: 51 passed; backend `python -m unittest discover -s tests`: 19 passed. Live question regeneration was also verified in the local app using the saved viewer and Hubert brief before combining with main. The combined branch was build/test verified; it was not separately deployed or tested against live Elasticsearch.
