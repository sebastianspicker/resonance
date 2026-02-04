# FINDINGS

## P1
- **Dependency vulnerabilities reported during audit (resolved)**
  - **Location:** `server/package-lock.json` (transitive dependencies)
  - **Expected:** No High/Critical vulnerabilities in production dependencies.
  - **Actual:** `npm audit` reported 1 high (Fastify) and 6 moderate (esbuild/vite chain) vulnerabilities.
  - **Fix strategy:** Upgrade Fastify to v5 and Vitest to v4 (major upgrades).
  - **Verification:** `npm audit` clean; `npm run build` green. Tests still require local DB.
  - **Status:** Resolved in Phase 2 / Iteration 3.

- **Dev auth exposed by default (resolved)**
  - **Location:** `server/src/config.ts`, `server/src/server.ts`
  - **Expected:** Production runs must not expose `/dev/*` auth flows unless explicitly enabled.
  - **Actual:** `AUTH_MODE` defaulted to `dev`, enabling `/dev/login`, `/dev/authorize`, `/dev/issue` when unset.
  - **Fix strategy:** Default `AUTH_MODE` to `prod` and validate values; add tests for dev endpoints when not in dev.
  - **Verification:** `tests/dev-auth.test.ts` ensures 404s when `AUTH_MODE=prod`.
  - **Status:** Resolved in Phase 3 / Iteration 1.

- **Deletion is soft-only; artifacts and storage not cleaned up (resolved)**
  - **Location:** `server/src/server.ts` (`DELETE /entries/:entryId`), `server/src/storage.ts`; `docs/SECURITY.md`
  - **Expected:** Deleting an entry removes metadata and associated media (or docs explicitly state soft-delete only).
  - **Actual:** Endpoint only set `deletedAt`; artifacts and storage objects remained.
  - **Fix strategy:** Implement hard-delete + S3 delete; remove feedback/markers.
  - **Verification:** `tests/acl.test.ts` hard delete test; `npm test` green.
  - **Status:** Resolved in Phase 3 / Iteration 7.

## P2
- **Deleted entries can still be modified or submitted (resolved)**
  - **Location:** `server/src/server.ts` (`PATCH /entries/:entryId`, `POST /entries/:entryId/submit`)
  - **Expected:** Soft-deleted entries should be immutable and un-submittable.
  - **Actual:** No guard on `deletedAt`; deleted entries could be edited/submitted if ID is known.
  - **Fix strategy:** Reject operations when `deletedAt` is set.
  - **Verification:** Test for patch on deleted entries (returns 410).
  - **Status:** Resolved in Phase 3 / Iteration 2.

- **Input validation gaps lead to 500s or bad data (resolved)**
  - **Location:** `server/src/server.ts` (create/update entry, create feedback)
  - **Expected:** Invalid dates/types produce 400 with validation errors.
  - **Actual:** `practiceDate`/`durationSeconds`/`markers` accepted unchecked types; `new Date(...)` could yield invalid dates.
  - **Fix strategy:** Add minimal runtime validation (date validity, numeric ranges, marker fields).
  - **Verification:** Negative tests for invalid payloads.
  - **Status:** Resolved in Phase 3 / Iteration 8 (dates, numbers, enums, tags).

- **CORS is fully open (resolved)**
  - **Location:** `server/src/server.ts` (`cors` with `origin: true`)
  - **Expected:** Explicit allowlist for production origins.
  - **Actual:** Reflected any origin.
  - **Fix strategy:** Configure allowlist via env; keep open when `CORS_ORIGINS` empty.
  - **Verification:** `tests/cors.test.ts` (allowlist vs open).
  - **Status:** Resolved in Phase 3 / Iteration 4.

- **Docs claim redirect URI validation that is not enforced (resolved)**
  - **Location:** `docs/SECURITY.md`, `server/src/server.ts` (`POST /auth/session`)
  - **Expected:** Redirect URI validation or docs that accurately reflect behavior.
  - **Actual:** `redirectUri` is accepted but not validated.
  - **Fix strategy:** Correct documentation for dev auth flow.
  - **Verification:** `docs/SECURITY.md` updated.
  - **Status:** Resolved in Phase 3 / Iteration 5.

- **Test coverage gaps on critical auth flows (resolved)**
  - **Location:** `server/tests/*.test.ts`
  - **Expected:** Coverage for refresh rotation, revoked/expired tokens, and deletion/submit restrictions.
  - **Actual:** Tests covered basic auth, ACL, upload only.
  - **Fix strategy:** Add targeted tests for refresh rotation/revocation.
  - **Verification:** `tests/auth.test.ts` refresh tests; `npm test` green.
  - **Status:** Resolved in Phase 3 / Iteration 6.

- **GitHub hygiene missing**
  - **Location:** `.github/` (missing), `README.md` (not fully EN-complete), `.gitignore` coverage gaps
  - **Expected:** CI, issue/PR templates, and complete README in English; .gitignore for build artifacts.
  - **Actual:** No CI/templates; README partial; .gitignore missing common build outputs (e.g., `dist/`).
  - **Fix strategy:** Add CI/workflows and templates; tighten README and .gitignore.
  - **Verification:** CI green; README consistent with RUNBOOK.

## P3
- **iOS tags stored as CSV (resolved)**
  - **Location:** `ios/ResonanceApp/Sources/Models.swift`
  - **Expected:** Tags should round-trip without loss.
  - **Actual:** Commas in tags are not preserved; split/join loses data.
  - **Fix strategy:** Store tags as JSON in the existing string field with CSV fallback for legacy data.
  - **Verification:** `ResonanceAppTests.testTagsRoundTripWithCommas`.
  - **Status:** Resolved in Phase 3 / Iteration 9.

- **No lint/format tooling configured (resolved)**
  - **Location:** `server/package.json`
  - **Expected:** Standard lint/format scripts for consistent code quality.
  - **Actual:** Only build/test scripts.
  - **Fix strategy:** Add ESLint + Prettier with scripts and config; wire lint into CI.
  - **Verification:** `npm run lint` green; RUNBOOK updated; CI includes lint step.
  - **Status:** Resolved in Phase 3 / Iteration 10.
