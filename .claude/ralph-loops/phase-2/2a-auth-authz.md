# Ralph Loop 2a: Authentication & Authorization Vulnerabilities

You are fixing authentication and authorization vulnerabilities in the Resonance server. Work on ONE vulnerability per iteration.

## Context
- Auth implementation: `server/src/auth.ts` (JWT sign/verify, refresh rotation, dev auth codes)
- Auth routes: `server/src/routes/auth.ts` (login flow, session, refresh, logout, dev routes)
- Authorization helpers: `server/src/validation.ts` (requireCourseRole, requireEntryAccess, requireStudentOwner, requireTeacherRole)
- Config: `server/src/config.ts` (JWT secret, token TTLs)
- Known bugs: `docs/BUGS_AND_FIXES.md` — bugs #4, #9, #16-19, #31, #33-35
- Tests: `server/tests/auth.test.ts`, `server/tests/dev-auth*.test.ts`, `server/tests/acl.test.ts`

## Known Issues (from BUGS_AND_FIXES.md) — Work through IN ORDER

1. **Bug #33 - /auth/refresh not gated by AUTH_MODE:** In prod mode, `/auth/session` returns 501 but `/auth/refresh` is still callable. Either gate it or document why it should remain open.

2. **Bug #9/16 - Global role vs course role for authorization:** Verify ALL routes consistently use course role. Check `routes/courses.ts`, `routes/entries.ts`, `routes/artifacts.ts`, `routes/feedback.ts`.

3. **Bug #34 - deletedAt not enforced on artifact/feedback routes:** After loading entry/artifact, check `entry.deletedAt`. Verify completeness across all routes.

4. **Bug #35 - Client-controlled entry/artifact IDs with no format validation:** Validate ID format (reasonable length, alphanumeric + hyphens/underscores). Return 409 on duplicate.

5. **Bug #31 - JWT constraints:** Verify `iss`, `aud`, `algorithms` are set in `auth.ts`. Mark as verified if already done.

6. **Bug #4 - Refresh token rotation atomicity:** Verify wrapped in `$transaction` with conditional update. Mark as verified if already done.

## For Each Fix

1. Check `git log --oneline -15` for prior work
2. Read the relevant code to understand current state
3. Implement the fix
4. Add or update tests in the appropriate test file
5. Run `cd server && npm run build && npm test`
6. Commit

## Rules
- Always add tests for security fixes
- Do not weaken existing security controls
- If a fix would break the iOS client, document the breaking change clearly in the commit
- Prefer fail-closed defaults

## Completion
When all listed auth/authz issues are fixed or verified, output:

<promise>COMPLETE</promise>
