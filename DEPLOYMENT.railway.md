# Railway deployment

The root Dockerfile runs Next.js, FastAPI, and the Node research service in one container. Caddy is the only public listener. FastAPI and research bind to loopback; only the signed `/voice/session` WebSocket is proxied directly to FastAPI. Other requests pass through the authenticated Next.js routes.

- Attach a persistent volume at `/data`.
- Start command: `node scripts/start-hosted.mjs` (also the Docker CMD).
- Set `SESSION_SECRET` to a private random value of at least 32 characters.
- Configure `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `APIFY_TOKEN`, and `DEEPGRAM_API_KEY` as private hosting variables.
- Models: `OPENAI_MODEL=gpt-5.6-luna`, `OPENAI_QUESTION_MODEL=gpt-5.6-luna`, `PIPELINE_MODEL=gpt-5.6-terra`.
- Railway supplies PORT and RAILWAY_PUBLIC_DOMAIN. For a custom domain, set VOICE_API_URL to its HTTPS origin.

The launcher preserves frontend accounts at `/data/arachne.db`, backend records at `/data/backend/app.db`, resume uploads at `/data/uploads`, and LinkedIn cache at `/data/profile-cache`. It generates a separate internal signing key on the volume and shares it only with the child processes. No laptop database, upload, or API-key file is included in the image.

Prisma schema initialization runs at startup without accepting destructive changes. The public gateway starts only after all three services respond. If a child exits, the container stops for Railway to restart. Use a single replica with this SQLite architecture.

Deploy the branch containing these files; deploying main without them restores the frontend-only setup. The initial release was uploaded with `railway up` while GitHub repository discovery was unavailable. Existing backend data is shared at the application level; this deployment does not add tenant-level data isolation.
