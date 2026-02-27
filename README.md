# Resonance – Practice & Feedback

Offline-first, iPad-first MVP for a university of music. Students capture short practice evidence (audio/video snippets), submit to a course, receive structured teacher feedback, and export summaries.

> Note: this is App, API-Skeleton and Frontend. You need to provide your own Backend/Connector.

## Features (MVP)
- Offline-first iPad app with local storage and sync queue
- Course membership and entry submission workflow
- Pre-signed uploads to S3-compatible storage (MinIO in dev)
- Teacher review queue + feedback with timestamped markers
- Token-based auth with refresh rotation (dev auth flow only)

## Monorepo Layout
- `ios/ResonanceApp/` — SwiftUI iPad app (Swift Package)
- `server/` — Node.js TypeScript backend (Fastify + Prisma)
- `infra/` — Docker Compose for Postgres + MinIO
- `docs/` — Product, architecture, security, and status docs
- `scripts/` — Helper scripts

## Requirements
- Node.js 20.x + npm
- Docker Desktop (Postgres + MinIO)
- Xcode (for iOS app)

## Quick Start (Local Dev)

### 1) Backend

1. Copy env file and set dev auth:

```bash
cp server/.env.example server/.env
```

Make sure `AUTH_MODE=dev` is set in `server/.env` for local development.

2. Start Postgres + MinIO:

```bash
docker compose -f infra/docker-compose.yml up -d
```

3. Install deps, generate Prisma client, migrate, and seed:

```bash
cd server
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

4. Start the API:

```bash
npm run dev
```

API runs on `http://localhost:4000`.

### 2) iOS (iPad) app

Open the Swift Package in Xcode:

```bash
open ios/ResonanceApp/Package.swift
```

Select the `ResonanceApp` scheme and run on an iPad simulator. The app uses a dev auth flow via `ASWebAuthenticationSession`.

Optionally set the API base for the app (default is `http://localhost:4000`):

- `RESONANCE_API_BASE` (environment variable when running in Xcode)

## Configuration

Backend environment variables (see `server/.env.example`):

- `DATABASE_URL` — Postgres connection string
- `JWT_SECRET` — signing key (required)
- `AUTH_MODE` — `dev` or `prod` (defaults to `prod`)
- `CORS_ORIGINS` — comma-separated allowlist (empty = fail-closed, no cross-origin access)
- `S3_*` — MinIO/S3 endpoint + credentials

## Development Scripts (Server)

```bash
cd server
npm run dev          # start dev server
npm run build        # TypeScript build
npm run start        # run compiled server
npm run clean        # remove local build/test artifacts in server/
npm test             # run tests (requires Postgres)
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run format:check # Prettier (check)
```

Workspace cleanup (repo root):
```bash
./scripts/clean-workspace.sh
```

## Tests

Backend tests require Postgres running and `DATABASE_URL` pointing to a test database (must include `test`, e.g. `resonance_test`):

```bash
docker compose -f infra/docker-compose.yml up -d
cd server
npm test
```

iOS unit tests can be run from Xcode with the `ResonanceAppTests` scheme.

## Validation (build / run / test)

To verify the repo end-to-end:

```bash
# Infra + backend: build and test
docker compose -f infra/docker-compose.yml up -d
cd server && npm install && npm run prisma:generate && npm run prisma:migrate && npm run prisma:seed
npm run build && npm test

# Optional: full CI-style check from repo root (starts Postgres if needed)
./scripts/ci-local.sh --with-docker

# Secret scan (from repo root)
./scripts/secret-scan.sh
```

## RC Demo Bootstrap (Mock University)

For deterministic local release-candidate screenshots:

```bash
./scripts/demo/bootstrap-local-demo.sh
```

This seeds canonical mock data from `demo/fixtures/mock-university.json`.

To reset demo records only:

```bash
./scripts/demo/reset-local-demo.sh
```

## Security

- Dev auth endpoints (`/dev/*`) are disabled unless `AUTH_MODE=dev` and are restricted to localhost requests.
- Secret scanning: `./scripts/secret-scan.sh`
- Dependency audit: `npm audit --audit-level=high` (in `server/`)
- SAST: CodeQL runs in GitHub Actions (`.github/workflows/codeql.yml`)

## API Notes

- `DELETE /entries/:entryId` hard-deletes entries and associated artifacts/feedback, and deletes storage objects.
- Production auth is not implemented yet; `/auth/session` returns `AUTH_NOT_CONFIGURED` when `AUTH_MODE=prod`.

## Troubleshooting

- **`docker compose` not found**: Ensure Docker Desktop is installed and running.
- **Prisma cannot reach DB**: Confirm Postgres is running and `DATABASE_URL` is set.
- **Dev auth endpoints 404**: Set `AUTH_MODE=dev` in `server/.env`.
- **CORS issues in prod**: Set `CORS_ORIGINS` to explicit allowed origins.

## Docs
- `docs/INDEX.md` — Canonical documentation entry point
- `docs/PRD.md` — Product requirements
- `docs/ARCHITECTURE.md` — Architecture
- `docs/API.md` — API reference
- `docs/UI.md` — UI spec
- `docs/SECURITY.md` — Security documentation
- `docs/RUNBOOK.md` — Ops runbook
- `docs/RELEASE_CANDIDATE_DEMO.md` — RC demo bootstrap and preflight
- `docs/RELEASE_CANDIDATE_SCREENSHOTS.md` — screenshot matrix and capture playbook
- `docs/RELEASE_CHECKLIST.md` — release gates checklist
- `docs/BUGS_AND_FIXES.md` — Known bugs and required fixes (issue source)
- `docs/archive/` — Archived historical docs

## License
MIT.
