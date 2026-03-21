# Ralph Loop 6c: CI/CD Pipeline Improvements

You are improving the GitHub Actions CI pipeline for Resonance. Work on ONE improvement per iteration.

## Context
- CI workflow: `.github/workflows/ci.yml`
- CodeQL: `.github/workflows/codeql.yml`
- Security audit: `.github/workflows/security-audit.yml`
- Dependabot: `.github/dependabot.yml`
- Scripts: `scripts/secret-scan.sh`, `scripts/check-no-build-artifacts.sh`, `scripts/ci-local.sh`

## Improvements to Evaluate

1. **CI completeness:**
   - Currently runs: infra validate, lint, format check, secret scan, build artifact guard, prisma generate, migrate, build, test
   - Missing: coverage reporting, dependency license check
   - Consider: adding `npm audit --audit-level=high` as a CI step

2. **CI reliability:**
   - Postgres health check is configured — verify timeout is sufficient
   - Node version is pinned to "20" — consider using `.nvmrc` for consistency
   - Actions are pinned to SHA — good, verify they're current

3. **CI speed:**
   - npm ci with caching — already configured
   - Consider if `fileParallelism: false` in vitest is necessary
   - Could lint and build run in parallel?

4. **Security CI:**
   - CodeQL workflow exists — verify it scans the right languages
   - Security audit workflow — verify it runs `npm audit`

5. **Local CI parity:**
   - `scripts/ci-local.sh` should mirror the CI workflow
   - Verify it runs the same steps in the same order

## For Each Improvement

1. Evaluate the benefit vs complexity
2. Implement the change
3. Validate YAML syntax
4. Commit

## Rules
- CI should complete in under 10 minutes
- Do not add CD (deployment) steps
- Keep workflows simple and readable
- Pin all third-party actions to SHA

## Completion
When CI pipeline is complete, reliable, and matches local development, output:

<promise>COMPLETE</promise>
