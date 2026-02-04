# RUNBOOK

This runbook captures the current, reproducible commands for local development and verification.
If a command is marked "Not configured", it is a deliberate gap to be addressed in Phase 2.

## Prerequisites
- Node.js (recommended: 20.x) + npm
- Docker Desktop (for Postgres + MinIO)
- Xcode (for iOS app work)

## Environment
- Backend env file:
  - `cp server/.env.example server/.env`

## Local Services
Start Postgres + MinIO:
```bash
docker compose -f infra/docker-compose.yml up -d
```
Stop services:
```bash
docker compose -f infra/docker-compose.yml down
```

## Backend (Fastify + Prisma)
Install deps:
```bash
cd server
npm install
```

Generate Prisma client:
```bash
npm run prisma:generate
```

Run migrations:
```bash
npm run prisma:migrate
```

Seed dev data:
```bash
npm run prisma:seed
```

Start dev server:
```bash
npm run dev
```

Build (also acts as typecheck):
```bash
npm run build
```

Start production build:
```bash
npm run start
```

## Tests
Backend tests (requires Postgres + MinIO running):
```bash
cd server
npm test
```

iOS unit tests:
- Open `ios/ResonanceApp/Package.swift` in Xcode
- Run the `ResonanceAppTests` scheme

## Lint/Format
Server lint:
```bash
cd server
npm run lint
```

Server format (optional):
```bash
cd server
npm run format
```

## Security (Baseline)
- Secret scan:
```bash
./scripts/secret-scan.sh
```
- SCA/dependency scan (requires network access):
```bash
cd server
npm audit --audit-level=high
```
- SAST: CI runs CodeQL for `server/` (see `.github/workflows/codeql.yml`).

## Fast Loop (minimal)
```bash
docker compose -f infra/docker-compose.yml up -d
cd server
npm test
```

## Full Loop
```bash
docker compose -f infra/docker-compose.yml up -d
cd server
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
npm test
```
