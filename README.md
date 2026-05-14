# PROJECT EXTRACTION

A cross-device behavioral monitoring operating system.

## Quick start

```
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

Backend will be available at `http://localhost:3001` (once the backend
package lands in Phase 1).

Helper:

```
./scripts/dev.sh
```

## Repo structure

```
.
├── docs/                       # Specification + roadmap
├── packages/
│   ├── shared/                 # Shared TS types / constants
│   ├── backend/                # NestJS API + WebSocket gateway (TBD)
│   ├── mobile/                 # React Native / Expo app
│   ├── extension/              # Manifest V3 browser extension
│   └── desktop-agent/          # Go desktop telemetry agent
├── infra/
│   └── k8s/                    # Kubernetes manifests
├── scripts/                    # dev / build / db-setup helpers
├── docker-compose.yml          # Local Postgres + Redis (+ optional Ollama)
├── Dockerfile.backend          # Production backend image
└── .github/workflows/          # CI + deploy pipelines
```

## Docs

- `docs/PROJECT_EXTRACTION_SPECIFICATION.md` — full architectural spec
- `docs/IMPLEMENTATION_ROADMAP.md` — phased delivery plan
- `infra/README.md` — infrastructure operations
- `infra/k8s/README.md` — Kubernetes deployment

## Development commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run every package's dev script via turbo |
| `npm run build` | Build all packages (TypeScript via turbo + Go via script) |
| `npm run lint` | Lint all packages |
| `npm run typecheck` | TypeScript typecheck across packages |
| `npm run test` | Run all package test suites |
| `./scripts/dev.sh` | Bring up docker compose + run `npm run dev` |
| `./scripts/build-all.sh` | Build TypeScript packages and Go agent |
| `./scripts/db-setup.sh` | Wait for Postgres, run migrations, seed |

## Tech stack (per spec)

- Backend: NestJS, PostgreSQL 15, Redis 7
- Mobile: React Native + Expo, SQLite
- Desktop agent: Go 1.22
- Browser extension: TypeScript, esbuild, Manifest V3
- AI: Ollama (local) + ElevenLabs (TTS)
- Infra: Docker, Kubernetes, GitHub Actions

## License

Private — see organization policy.
