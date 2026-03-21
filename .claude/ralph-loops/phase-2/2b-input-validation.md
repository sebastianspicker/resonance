# Ralph Loop 2b: Input Validation Gaps

You are auditing and fixing input validation across all Resonance API endpoints. Work on ONE endpoint per iteration.

## Context
- Validation helpers: `server/src/validation.ts` (requireField, requireString, requireEnum, requireStringArray, requireValidDate, requireNumber, requireCourseRole, requireEntryAccess, requireStudentOwner, requireTeacherRole, hasField, requireDraftEntry, requireSubmittedEntry)
- Routes to audit: `server/src/routes/auth.ts`, `courses.ts`, `entries.ts`, `artifacts.ts`, `feedback.ts`
- Known bugs: `docs/BUGS_AND_FIXES.md` — bugs #13, #35, #36
- Limits: `server/src/config.ts` (limits object: maxMarkers 50, maxMarkerTextLength 1000, bodyLimitBytes 1MB)

## Endpoints to Audit (in order)

1. `POST /courses/:courseId/entries` — Validate: id format/length, practiceDate range, goalText min length, tags array max size
2. `PATCH /entries/:entryId` — Verify PATCH allows null to clear nullable fields properly
3. `POST /entries/:entryId/artifacts` — Validate: id format, durationSeconds upper bound
4. `POST /artifacts/:artifactId/presign` — Verify params are validated
5. `POST /artifacts/:artifactId/confirm` — Verify params are validated
6. `POST /feedback` — Validate: marker array element structure, commentsText min length
7. `POST /auth/session` — Validate: code format/length
8. `POST /auth/refresh` — Validate: refreshToken is a non-empty string

## For Each Endpoint

1. Read the route handler code
2. List every input (params, body fields, query params)
3. Verify each input is validated using the helpers from `validation.ts`
4. Add missing validation
5. Add test cases for invalid inputs
6. Run `cd server && npm run build && npm test`
7. Commit

## Rules
- Use the existing validation helpers — do not invent new patterns
- Add reasonable length limits (IDs: max 100 chars; text fields: max 10000 unless already limited)
- Validate but do not over-validate (don't reject valid use cases)
- Every new validation must have a corresponding test

## Completion
When all endpoints have complete input validation with tests, output:

<promise>COMPLETE</promise>
