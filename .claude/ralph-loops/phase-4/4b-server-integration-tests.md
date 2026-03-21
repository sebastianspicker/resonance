# Ralph Loop 4b: Server Integration Test Gaps

You are adding missing integration tests for the Resonance API. Work on ONE endpoint per iteration.

## Context
- Existing integration tests: `server/tests/acl.test.ts` (entry CRUD, review queue, cascade delete, role-based access)
- Test utils: `server/tests/testUtils.ts` (getAccessToken, seedBasic, resetDb, prisma, app, s3Mock)
- Bug #46: "Multiple critical routes untested (submit, feedback GET, auth/me, course detail, dev/authorize)"
- Bug #47: "ACL tests miss global-role vs course-role and artifact IDOR cases"

## Untested Endpoints (add tests for each)

1. **GET /auth/me** — returns current user info
2. **POST /auth/logout** — revokes refresh tokens
3. **POST /auth/refresh** — token rotation (happy path, expired token, already-revoked token)
4. **GET /courses/:courseId** — single course detail
5. **POST /entries/:entryId/submit** — submit entry (happy: draft with uploaded artifacts, error: no artifacts, error: already submitted)
6. **PATCH /entries/:entryId** — update entry (happy: update goalText, error: submitted entry lock, edge: null to clear notes)
7. **POST /entries/:entryId/artifacts** — create artifact (happy path, error: deleted entry)
8. **POST /artifacts/:artifactId/presign** — presign (happy path, error: non-owner student)
9. **GET /entries/:entryId/feedback** — feedback list (happy path, empty list)
10. **POST /feedback** — create feedback with markers (happy path, error: draft entry, error: student posting)

## ACL Gap Tests (from bug #47)

11. Global-teacher enrolled as course-student: verify they can only access their own entries
12. Artifact presign as non-owner student: verify 403
13. Artifact confirm as non-owner student: verify 403
14. Feedback by student: verify 403

## For Each Endpoint

1. Add tests to the most appropriate test file (or create a new one)
2. Include: happy path, at least one authorization failure, at least one validation failure
3. Run `cd server && npm test`
4. Commit

## Rules
- Use existing testUtils (getAccessToken, seedBasic, resetDb)
- Each test should be self-contained (resetDb in beforeEach)
- Follow existing test style (describe blocks, descriptive it() names)
- Mock S3 where file operations are involved

## Completion
When all endpoints and ACL gaps have integration tests, output:

<promise>COMPLETE</promise>
