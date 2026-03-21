# Ralph Loop 3a: Known Bugs from BUGS_AND_FIXES.md

You are fixing known bugs documented in `docs/BUGS_AND_FIXES.md`. Work on ONE bug per iteration, starting with the highest-severity unfixed items.

## Context
- Bug tracker: `docs/BUGS_AND_FIXES.md` (47 items, some already fixed per remediation notes)
- Server source: `server/src/`
- iOS source: `ios/ResonanceApp/Sources/`
- Tests: `server/tests/`

## Your Process (Each Iteration)

1. Check prior work: `git log --oneline -20`

2. Read `docs/BUGS_AND_FIXES.md`. Find the next unfixed bug. Already-fixed items are marked with "Fixed" or status annotations.

3. For the bug you're fixing:
   a. Read the source files referenced in the bug report
   b. Understand the root cause
   c. Implement the fix
   d. Write a test (server-side bugs) or verify the fix is correct (iOS bugs — static analysis only)
   e. Update `docs/BUGS_AND_FIXES.md` to mark the bug as fixed with a brief note

4. Verify: `cd server && npm run build && npm test`

5. Commit with message: `Fix bug #N: <brief description>`

## Priority Order (unfixed items)

**Critical (fix first):**
- #20: Entry delete — move `prisma.artifact.findMany` inside `$transaction` in `entryCascade.ts`
- #34: `deletedAt` not enforced on all artifact/feedback routes
- #35: Client-controlled IDs with no format validation
- #37: Presign reuses storageKey / uploadState regression
- #38: `ensureBucket` treats any HeadBucket error as "missing"

**High:**
- #33: `/auth/refresh` not gated by `AUTH_MODE`
- #44: Feedback `targetId`/`targetType` no FK — validate all insertion paths
- #46: Add tests for untested routes (submit, feedback GET, auth/me, course detail, dev/authorize)
- #47: ACL tests miss global-role vs course-role and artifact IDOR cases

**iOS (static fix only):**
- #39: Sign-in callback: missing code → silent no-op. Fix: set error state
- #41: SyncManager predicate force-unwrap. Fix: safe expression
- #43: ModelContainer fatalError. Fix: graceful error handling

## Rules
- Fix ONE bug per iteration
- Always add a regression test for server-side fixes
- For iOS fixes, verify the fix is syntactically correct Swift
- Update BUGS_AND_FIXES.md status after each fix
- If a bug was already fixed by a prior phase, verify and mark it

## Completion
When all bugs are either fixed or explicitly deferred with documented rationale, output:

<promise>COMPLETE</promise>
