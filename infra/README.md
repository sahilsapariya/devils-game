# Infrastructure

Everything required to run PROJECT EXTRACTION locally and deploy it later —
docker-compose for the dev stack, GitHub Actions for CI, and Kubernetes
manifests as the production target.

## Layout

```
infra/
├── README.md             # this file
└── k8s/                  # Kubernetes manifests (see k8s/README.md)
```

Top-level infra files live at the repo root because they need broad visibility:

- `docker-compose.yml` — local data plane (Postgres, Redis, optional Ollama)
- `Dockerfile.backend` — multi-stage production image for the backend
- `.dockerignore` — excludes node_modules, dist, secrets, etc. from build context
- `.env.example` — template for all required environment variables
- `.github/workflows/ci.yml` — lint, typecheck, test, build pipeline
- `.github/workflows/deploy.yml` — placeholder gated deploy pipeline
- `scripts/dev.sh`, `scripts/db-setup.sh`, `scripts/build-all.sh` — helper scripts

## Run locally

```
cp .env.example .env
docker compose up -d                # start postgres + redis
./scripts/db-setup.sh                # wait for postgres + run migrations
npm install
npm run dev                          # turbo runs every package's dev script
```

Or use the wrapper:

```
./scripts/dev.sh
```

Optional local LLM:

```
docker compose --profile ai up -d ollama
```

## Continuous Integration

Pull requests and pushes to `main` trigger `.github/workflows/ci.yml`, which
runs the following jobs (most in parallel):

- `lint-and-typecheck` — ESLint + `tsc --noEmit` across the monorepo
- `test-backend` — Jest tests with live Postgres + Redis service containers
- `test-mobile` — React Native typecheck and unit tests
- `build-desktop-agent` — `go build ./...` on `packages/desktop-agent`
- `build-extension` — bundles the Manifest V3 extension and verifies output
- `build-docker` — builds `Dockerfile.backend` (no push) to validate the image

Caching: npm dependencies via `actions/setup-node`, Go modules via
`actions/setup-go`, and Docker layers via GitHub Actions cache.

## Build production images

```
docker build -f Dockerfile.backend -t extraction-backend:local .
```

The build is multi-stage (deps → builder → runner). The runtime stage runs as
a non-root user, exposes port 3001, and ships with a `/health` healthcheck.

## Deploy to Kubernetes

See `infra/k8s/README.md` for the manifest set and apply order. The plan is:

1. Push image to a registry (GHCR, ECR, or GAR)
2. Update the image reference in `backend-deployment.yaml`
3. Create the `backend-secrets` Secret out-of-band (sealed-secrets / ESO)
4. `kubectl apply -f infra/k8s/`

Production rollout pattern (per spec): 10% → 50% → 100% with error-rate
guarded auto-rollback. Implement once a deploy target is chosen.

## Architecture

See `docs/PROJECT_EXTRACTION_SPECIFICATION.md` § Deployment Architecture and
`docs/IMPLEMENTATION_ROADMAP.md` Phase 8 for the broader plan.
