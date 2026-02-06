# CI Overview

## Workflows
- **CI** (`.github/workflows/ci.yml`)
  - Triggers: `push` to `main`, `pull_request`
  - Jobs:
    - `Infra Validate`: `docker compose config -q` for `infra/docker-compose.yml`
    - `Server Tests`: Postgres service, secret scan, lint, Prisma generate/migrate, typecheck, tests
- **CodeQL** (`.github/workflows/codeql.yml`)
  - Triggers: `push`, `pull_request`, weekly schedule
  - Scope: `server` (JavaScript/TypeScript)
- **Security Audit** (`.github/workflows/security-audit.yml`)
  - Triggers: weekly schedule, manual dispatch
  - Checks: `npm audit --audit-level=high --omit=dev` in `server`

## Local reproduction
### Option A: With Docker-managed Postgres (recommended)
```bash
./scripts/ci-local.sh --with-docker
```

### Option B: Use an existing local Postgres
```bash
export DATABASE_URL=postgresql://resonance:resonance@localhost:5432/resonance
./scripts/ci-local.sh
```

## Dependencies
- Node.js 20
- npm
- Docker (only if using `--with-docker`)

## Secrets and permissions
- CI uses no repo secrets.
- Permissions are minimal (`contents: read`), with CodeQL additionally requiring `security-events: write`.
- Any future deploy/secret-requiring jobs must be restricted to trusted contexts (`push` on `main` or `workflow_dispatch`) and guarded with explicit secret checks.

## Extending CI
- Keep PR checks fast and deterministic.
- Add new language/toolchain caches in the relevant job.
- For expensive or environment-bound jobs, use `workflow_dispatch` or `schedule`.
- Use clear job and step names; keep `timeout-minutes` on every job.
