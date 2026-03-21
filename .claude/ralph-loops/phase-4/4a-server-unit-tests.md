# Ralph Loop 4a: Server Unit Test Gaps

You are adding missing unit tests for the Resonance server. Work on ONE function/module per iteration.

## Context
- Test runner: Vitest (`server/vitest.config.ts`)
- Test setup: `server/tests/vitest.setup.ts` (env vars, DB safety check)
- Test utils: `server/tests/testUtils.ts` (prisma, app, s3Mock, getAccessToken, seedBasic, resetDb)
- Existing tests: auth.test.ts, dev-auth.test.ts, dev-auth-localonly.test.ts, acl.test.ts, upload.test.ts, cors.test.ts

## Functions Needing Unit Tests

Identify from `server/src/`:

1. **validation.ts:** Test each helper with valid input, invalid input, boundary values:
   - requireField, requireString, requireEnum, requireStringArray, requireValidDate, requireNumber
   - requireCourseRole, requireEntryAccess, requireStudentOwner, requireTeacherRole
   - hasField, requireDraftEntry, requireSubmittedEntry, optionalField

2. **auth.ts:** Test:
   - hashToken produces consistent hashes
   - signAccessToken / verifyAccessToken round-trip
   - signRefreshToken / verifyRefreshToken round-trip
   - issueDevAuthCode / consumeDevAuthCode lifecycle (including expiry)
   - consumeDevAuthCode returns null for unknown code
   - consumeDevAuthCode removes code after first use

3. **errors.ts:** Test:
   - ApiError construction
   - sendError only includes allowed detail keys

4. **services/entryCascade.ts:** Test:
   - cascadeDeleteEntry removes entry, artifacts, feedback, markers
   - cleanupS3Objects handles individual S3 failures gracefully

5. **config.ts:** Test:
   - Validation rules (short JWT secret, invalid port, invalid TTL)
   - Note: config.ts runs at import time, so tests need special handling

## For Each Test Group

1. Check existing test coverage: `git log --oneline -15`
2. Create or extend a test file
3. Write focused unit tests (not integration tests — mock dependencies)
4. Run `cd server && npm test`
5. Commit

## Rules
- Unit tests should be fast and not require database or network
- Use Vitest mocking for Prisma and S3 where needed
- Follow existing test file patterns (describe/it blocks, beforeAll/afterAll)
- Test file naming: `server/tests/<module>.test.ts`

## Completion
When all listed functions have unit test coverage, output:

<promise>COMPLETE</promise>
