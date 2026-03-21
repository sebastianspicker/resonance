# Ralph Loop 6d: Infrastructure Hardening

You are improving the infrastructure configuration for Resonance. Work on ONE area per iteration.

## Context
- Docker Compose: `infra/docker-compose.yml`
- Scripts: `scripts/` (shell scripts)
- Server env: `server/.env.example`
- Gitignore: `.gitignore`

## Areas to Harden

1. **Docker Compose:**
   - Health checks on all services (postgres has one, does minio?)
   - Volume persistence configuration
   - Resource limits (memory, CPU) for dev environment
   - Network isolation between services

2. **Environment configuration:**
   - `server/.env.example` should have all variables documented with comments
   - Required vs optional variables should be clearly marked
   - Dangerous defaults should be flagged (AUTH_MODE=dev in particular)

3. **Shell scripts:**
   - `scripts/secret-scan.sh`: verify it catches common patterns
   - `scripts/check-no-build-artifacts.sh`: verify it checks the right directories
   - `scripts/ci-local.sh`: verify it matches CI pipeline
   - `scripts/clean-workspace.sh`: verify it's safe
   - All scripts should have `set -euo pipefail` at the top

4. **Gitignore completeness:**
   - Verify all build artifacts are ignored
   - Verify all environment files are ignored
   - Verify OS-specific files are ignored (.DS_Store, Thumbs.db)
   - Verify IDE files are ignored (.idea, .vscode, .cursor)

## For Each Area

1. Read the current configuration
2. Identify gaps or risks
3. Fix them
4. Test where possible (docker compose config, script syntax check)
5. Commit

## Rules
- Do not break the development workflow
- Prefer defensive defaults (fail-closed)
- Document any non-obvious configuration choices with comments
- Keep scripts POSIX-compatible where practical

## Completion
When all infrastructure areas are hardened, output:

<promise>COMPLETE</promise>
