FROM caddy:2 AS proxy
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt
COPY --from=proxy /usr/bin/caddy /usr/local/bin/caddy
COPY --from=build /app /app
ENV NODE_ENV=production
CMD ["node", "scripts/start-hosted.mjs"]
