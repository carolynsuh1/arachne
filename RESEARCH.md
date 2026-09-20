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

## Person-linked resumes and research

The Research page now has a Saved person data panel. Choose a graph person, select an existing person, or enter a name and create a new person. Completed research for a selected person saves automatically. Previously unlinked briefs can be attached explicitly. Reopen the person to see all saved briefs and resume versions.

Upload text PDFs through POST /person-data/{person_id}/resume (application/pdf, max 10 MB / 12 pages). FastAPI extracts text with pypdf, then the private Node /api/resume endpoint parses fields with source-line evidence. Nonmatching resume names are rejected for manual review; names are not proof of identity, so users must choose the correct person. Parsed JSON and original extracted lines are stored in resume_records in SQLite. Original PDF bytes are not retained. Reuploading the same PDF for that person reuses its saved parse. Scanned PDFs require OCR and are not supported yet. Existing person fields and graph relationships are not overwritten.

GET /person-data lists people; POST creates a person; GET /person-data/{id} returns research and resume history. POST /person-data/{id}/research/{brief_id} attaches an unlinked, name-matching brief. No Dropbox is involved in these flows.

Install updated backend requirements. Set FRONTEND_ORIGINS to a comma-separated list of allowed frontend origins when testing/deploying. Resume requests may take up to 260 seconds, including one evidence-repair attempt. Production authentication is still required before exposing personal resume history publicly.

Validation: 42 Node tests, 10 backend tests, and frontend production build.

## Personal question context

About me saves name, school/current role, background, interests, goals and contribution in SQLite personal_profiles. A random profile ID is remembered by each browser in localStorage; it is not authentication and does not provide account-level access control. Team login and ownership checks remain required for a public deployment. Personal details are sent to the question-generation model, not included in public search queries or used as evidence about the researched person.

New research includes the saved viewer profile in the question step and cache key. Each brief records the profile snapshot used for its questions. POST /research/briefs/{brief_id}/questions regenerates from existing sourced facts and the current saved profile without scraping again, creating a new brief version linked to the same person. Existing questions are not silently rewritten when the profile changes. Empty profiles use the meeting goal without invented personal context.

Additional validation: three personalization tests and three backend profile/refresh tests (45 Node + 13 backend tests total), frontend build passes. Live external-model personalization has not been verified in this change.

Profiles now has a dedicated page with create, edit, select and saved cards. GET /my-profile lists profiles in this shared local workspace. Active profile selection persists per browser; research consumes the selected saved profile automatically. These are shared profiles, not authenticated private accounts.

## Import your own LinkedIn

Profile create/edit supports POST /my-profile/import-linkedin. It uses the private Node /api/self-profile route and existing cached Apify adapter; only LinkedIn /in/ URLs are accepted. Imported experience/education are previewed and require an explicit add-to-profile action, then Save profile persists them in SQLite. Existing manual fields are preserved and goals/interests/contribution are never inferred. A bounded role/education summary is supplied as viewer background during question generation. Imports do not verify account ownership. Tests: 47 Node + 15 backend, frontend build passed. The new import route was tested with provider fixtures; no new live Apify import was verified in this change.

Question generation now requests an exact viewer-profile excerpt for each personalized question and rejects unsupported excerpts. UI shows the excerpt under the question. Extraction prioritizes non-profile web facts because structured LinkedIn roles are added separately; accepted facts cap is 60. A Web coverage panel exposes retrieved, unavailable and unread links as unverified research leads. Live Hubert Gu run verified three questions referencing the active viewer background/goals and 13 discovered / 10 attempted / 9 retrieved sources. No additional web facts passed evidence and identity checks in that run; inspected fencing and Ivey pages had incomplete or no relevant extracted content.

Conversation style: questions use gpt-5.6-luna with low reasoning by default (override OPENAI_QUESTION_MODEL). Six candidates are generated; up to three survive fact/profile citation checks, the 35-word limit, and compound-question filtering. Prompts emphasize natural speech, dates, distinct angles and one useful next-step question, rather than repeating the viewer resume. Profile evidence is collapsed in the UI. This changes prompting/model selection; no model training is performed.

Question model migration: gpt-5.6-luna is the default, override OPENAI_QUESTION_MODEL. Account model listing confirmed access to Luna, Terra and Sol. Research extraction and resume parsing retain their existing model configuration.

Question audit correction: viewer professionalBackground now includes LinkedIn role descriptions, dates, education fields and About text (bounded to 14k characters), rather than only title/company summaries. This context only goes to question generation, not public search or subject identity extraction. Luna drafts candidates and a separate Luna call audits/revises them against both timelines and substantive relevance. Exact source excerpts include role descriptions. Generic placeholder contribution text is excluded from quote choices. Regeneration timeout allows the two calls. No additional scraping is required.
