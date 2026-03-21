# Ralph Loop 2d: Secret/Credential Exposure Risks

You are auditing the Resonance repository for secret and credential exposure. Work on ONE area per iteration.

## Context
- Secret scan script: `scripts/secret-scan.sh`
- Env example: `server/.env.example`
- Test setup: `server/tests/vitest.setup.ts` (sets JWT_SECRET, S3 credentials for testing)
- Gitignore: `.gitignore`
- Bug #30: .env.example deploy-dangerous auth and placeholders

## Areas to Audit

1. **Source code scan:** Grep all `.ts` and `.swift` files for patterns that look like hardcoded secrets (API keys, passwords, tokens, connection strings). Verify that test credentials in `vitest.setup.ts` are clearly test-only values.

2. **Configuration files:** Check `.env.example` — ensure all secrets use obviously-fake placeholder values. Add comments warning against using defaults.

3. **Git history check:** `git log --all --oneline -- '*.env' '*.key' '*.pem'` — ensure no real secrets were ever committed. Check `.gitignore` covers `.env`, `*.key`, `*.pem`, `*.p12`.

4. **iOS hardcoded values:** Check `AppConfig.swift` for hardcoded URLs or credentials. Document that demo IDs are demo-only.

## Rules
- Do not commit any real secrets
- If you find a committed secret, alert immediately in the commit message
- Make `.env.example` safe to copy directly (should fail loudly if used as-is, not silently work with insecure defaults)

## Completion
When all areas are audited and no secret exposure risks remain, output:

<promise>COMPLETE</promise>
