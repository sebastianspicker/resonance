# LOG

## 2026-02-04
- Phase 0: Inventory, created `docs/RUNBOOK.md` and `docs/REPO_MAP.md`. Verified via file inspection. Status: green.
- Phase 1: Read-only analysis completed; findings documented in `docs/FINDINGS.md`. Verified via file inspection. Status: green.
- Phase 2 / Iteration 1: Added CI workflow for server and fixed TypeScript build (exclude prisma from build; use numeric JWT expires). Verified with `npm run build`. Status: green.
- Phase 2 / Iteration 1: Documented npm-reported dependency vulnerabilities in `docs/FINDINGS.md` for triage. Status: red (High vulnerability pending).
- Phase 2 / Iteration 2: Ran `npm audit`; found High (Fastify) and Moderate (esbuild/vite chain) vulnerabilities. Fixes require major upgrades (`fastify@5`, `vitest@4`). Status: red (gate required).
- Phase 2 / Iteration 3: Upgraded Fastify to v5 and Vitest to v4 to resolve SCA; `npm audit` clean; `npm run build` green; `npm test` failed due to missing local Postgres. Status: red (test blocker).
- Phase 2 / Iteration 4: Installed docker-compose plugin (Homebrew) and configured Docker CLI plugin path; `docker compose up` failed because Docker daemon not running. Status: red (daemon not running).
- Phase 2 / Iteration 5: Started Postgres via Docker, ran Prisma generate/migrate, fixed test parallelism and S3 client config in tests, tests now passing; updated MinIO image to `latest` and removed obsolete compose version field. Status: green.
- Phase 2 / Iteration 6: Updated `.gitignore` to cover build artifacts, IDE files, and allowlist env examples. Status: green.
- Phase 2 / Iteration 7: Added GitHub issue templates and PR template. Status: green.
- Phase 2 / Iteration 8: Added secret scan script, CodeQL workflow, and CI audit step; verified secret scan + npm audit. Status: green.
- Phase 3 / Iteration 1: Defaulted AUTH_MODE to prod with validation; added dev-auth tests; `npm test` green. Status: green.
- Phase 3 / Iteration 2: Guarded deleted entries (410), added ACL test; `npm test` green. Status: green.
- Phase 3 / Iteration 3: Added input validation (dates/numbers/markers) and negative test; `npm test` green. Status: green.
- Phase 3 / Iteration 4: Added CORS allowlist via env with tests; `npm test` green. Status: green.
- Phase 3 / Iteration 5: Updated SECURITY docs to reflect redirectUri validation reality. Status: green.
- Phase 3 / Iteration 6: Added refresh-token rotation tests; `npm test` green. Status: green.
- Phase 3 / Iteration 7: Implemented hard delete with S3 cleanup + feedback/marker cleanup; added test; updated API/DATA_MODEL docs; `npm test` green. Status: green.
- Phase 3 / Iteration 8: Strengthened input validation (strings/enums/tags) with additional negative tests; `npm test` green. Status: green.
- Phase 3 / Iteration 9: Switched iOS tags storage to JSON-with-CSV fallback and added unit test for commas. Status: green (tests not run; Xcode required).
- Phase 3 / Iteration 10: Added ESLint + Prettier tooling, lint config, CI lint step, and fixed lint errors; `npm run lint` green. Status: green.
- Phase 4 / Iteration 1: Rewrote README in English with full GitHub-ready sections aligned to RUNBOOK/CI. Status: green.
- Phase 4 / Iteration 2: Added SECURITY.md and CONTRIBUTING.md for GitHub readiness. Status: green.
- Phase 5 / Iteration 1: Full RUNBOOK executed (docker compose up, secret scan, audit, lint, prisma generate/migrate/seed, build, tests). Status: green.
- Phase 5 / Iteration 2: Cleaned repo artifacts (removed server/dist and server/node_modules) and expanded `.gitignore` for caches/build outputs. Status: green.
