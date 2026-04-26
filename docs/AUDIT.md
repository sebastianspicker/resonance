# Deep Repository Audit (2026-04-26)

## 1) System overview: how the repo works together

Resonance is a monorepo for an offline-first iPad practice-tracking MVP with a Node/Fastify backend.

- **iOS app (`ios/ResonanceApp`)**: SwiftUI client for students and teachers, local persistence, sync queue, media capture/playback, calendar, export.
- **API server (`server`)**: Fastify + Prisma + Postgres, auth/session/refresh, course/entry/artifact/feedback APIs, S3-compatible presigned uploads.
- **Infra (`infra`)**: local docker-compose for Postgres + MinIO.
- **Operational scripts (`scripts`)**: CI-like local verification, secret scan, workspace cleanup, RC demo bootstrap/reset, screenshot capture helpers.
- **Documentation (`docs`)**: product, architecture, security, runbook, API/UI, release checklist.

Primary integration chain:
1. iOS authenticates and stores session tokens.
2. iOS creates/updates entries and artifacts locally.
3. Sync queue pushes data to server endpoints and uploads media via presigned URLs.
4. Teachers review submitted entries and post feedback.
5. iOS pulls updates and renders role-specific workflows.

## 2) Audit method and coverage

This audit pass focused on:
- **Security-sensitive request paths** (`/auth/*`, dev auth gates, callback handling).
- **Cross-cutting consistency/dedup** in loopback checks and route logic.
- **Operational reliability** in CI/local scripts (tool availability behavior).
- **Documentation accuracy** for security-fix status.

Inspected areas:
- Server auth/session routes, server bootstrap hooks, shared validation.
- Local CI shell workflow and container/tool assumptions.
- Existing bug ledger consistency with current implementation state.

## 3) Prioritized findings (P0/P1/P2)

### P0

No new exploitable P0 issue was identified in this pass beyond already-remediated items documented in `docs/BUGS_AND_FIXES.md`.

### P1 (fixed in this pass)

1. **Operational fragility in `scripts/ci-local.sh` when Docker is unavailable.**
   - Docker-dependent checks ran unconditionally in multiple steps, causing early failure even without `--with-docker`.
   - This blocked non-Docker local validation and reduced reproducibility.

2. **Security behavior drift risk from duplicated loopback IP logic.**
   - Loopback checks were duplicated in multiple files.
   - Duplicated security predicates can drift over time and create inconsistent behavior.

### P2 (fixed in this pass)

3. **Dead code in OIDC callback route.**
   - Unused `callbackUrl` variable in auth callback path.
   - Not a runtime bug, but adds noise and audit ambiguity.

4. **Documentation inconsistency for `redirectUri` validation status.**
   - `docs/BUGS_AND_FIXES.md` still marked redirect binding issues as deferred after implementation.
   - Risk: stale security docs can mislead operations/review.

## 4) Remediations implemented in this pass

1. **Refactor / dedup:** Introduced `isLoopbackIp` shared helper in `server/src/net.ts` and switched call sites to use it.
2. **Auth route cleanup:** Removed unused OIDC callback variable in `server/src/routes/auth.ts`.
3. **Script hardening:** Updated `scripts/ci-local.sh` to:
   - detect Docker availability once,
   - parse CLI arguments robustly and fail fast on unknown options,
   - gate compose validation appropriately,
   - fail fast if Docker-managed Postgres does not become ready in time,
   - run shellcheck/actionlint via Docker when available,
   - otherwise fall back to local binaries if present,
   - otherwise skip with explicit messages.
4. **Demo bootstrap reliability:** Updated `scripts/demo/bootstrap-local-demo.sh` to fail fast if Postgres readiness is not reached.
5. **Guardrail tests:** Added `server/tests/net.test.ts` to lock expected localhost IP behavior.
6. **Docs correctness:** Updated deferred redirectUri entries in `docs/BUGS_AND_FIXES.md` to fixed status and aligned narrative.

## 5) Follow-up recommendations

1. Add a small server unit test for `isLoopbackIp` to lock expected variants.
2. Split `scripts/ci-local.sh` into smaller composable functions to improve maintainability.
3. Add a docs status table (source-of-truth) for security controls to avoid status divergence across files.
4. Continue periodic dependency and SAST review as defined in security docs.

## 6) Current audit outcome

- **Security posture in audited paths:** improved (consistency + reduced operational footguns).
- **Maintainability:** improved through shared utility and dead-code removal.
- **Operational resilience:** improved for local CI checks across environments with/without Docker.
