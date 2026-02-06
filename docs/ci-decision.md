# CI Decision

## Decision
LIGHT CI.

The repo contains a TypeScript server (with unit/integration tests that run against Postgres), plus infra config and an iOS-only Swift package. We run full checks for the server and static validation for infra on PRs/pushes. iOS builds are excluded from default CI because they require macOS/Xcode and would be costly/flaky on GitHub-hosted runners without code-signing and simulator setup.

## Why this choice
- **Security and determinism**: PRs run only untrusted-safe checks with no secrets.
- **Reproducibility**: Server tests are deterministic with a disposable Postgres service.
- **Cost/complexity**: iOS builds require macOS runners and code-signing; high risk of non-deterministic failures without a dedicated setup.
- **Benefit now**: Server tests and infra validation catch the highest-impact regressions quickly.

## What runs where
- **Pull requests**
  - `CI` workflow: Docker Compose config validation, secret scan, server lint/build/test with Postgres
  - `CodeQL` workflow: static analysis for `server`
- **Push to main**
  - Same as PRs
- **Scheduled**
  - `CodeQL` weekly (Monday 03:00 UTC)
  - `Security Audit` weekly (Monday 04:00 UTC): `npm audit --audit-level=high --omit=dev`
- **Manual**
  - `Security Audit` via `workflow_dispatch`

## Threat model (CI)
- **Fork PRs**: Treated as untrusted. No secrets are used. No `pull_request_target`.
- **Least privilege**: Workflows run with `contents: read` only; CodeQL adds `security-events: write`.
- **Secrets exposure**: No deploy steps on PRs. Any future secret-requiring jobs must be restricted to `push` on `main` or `workflow_dispatch` and guarded by `if: secrets.X != ''`.

## If we later want FULL CI
- Add a macOS workflow for `ios/ResonanceApp` using Xcode toolchain.
- Define simulator/device targets and pin Xcode version.
- Add code-signing secrets (if building archives) with strict branch protections.
- Consider a self-hosted macOS runner if reliability or cost becomes an issue.
- Add end-to-end tests only after stable staging infrastructure is available.
