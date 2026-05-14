# Infrastructure

Project Extraction is deployed as a **single-VPS** stack using Docker Compose and
Caddy. Kubernetes manifests have been removed in favour of the simpler model.

## Topology

Three containers run on one VPS (e.g. Hetzner CPX11, Ubuntu 24.04):

- `caddy` — TLS termination, reverse proxy, automatic Let's Encrypt
- `backend` — NestJS API + Socket.io, SQLite-backed
- `ai-service` — NestJS AI orchestrator (OpenAI client + voice cache)

All TLS is automatic. Total RAM footprint at idle: ~300 MB.

## Where to look

- `docker-compose.prod.yml` (repo root) — production compose definition
- `Caddyfile.example` (repo root) — reverse-proxy template; copy to `Caddyfile` and edit the domain
- `.env.production.example` (repo root) — full env template
- `scripts/vps-bootstrap.sh` — first-run installer for a fresh VPS
- `scripts/backup-sqlite.sh` / `scripts/restore-sqlite.sh` — SQLite snapshot tooling
- `.github/workflows/deploy.yml` — SSH-based GitHub Actions deploy

## Setup walkthrough

See [`docs/simplification/VPS_DEPLOYMENT_GUIDE.md`](../docs/simplification/VPS_DEPLOYMENT_GUIDE.md)
for the step-by-step setup, and
[`docs/simplification/UPDATED_DEPLOYMENT_ARCHITECTURE.md`](../docs/simplification/UPDATED_DEPLOYMENT_ARCHITECTURE.md)
for the rationale.

## Run locally

```
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

## Continuous Integration

`.github/workflows/ci.yml` runs lint, typecheck, tests, and Docker image build.

## Build production images

```
docker build -f Dockerfile.backend -t extraction-backend:local .
docker build -f packages/ai-service/Dockerfile -t extraction-ai-service:local .
```

Both runtime images run as non-root, expose internal ports only, and ship
with `/health` healthchecks.
