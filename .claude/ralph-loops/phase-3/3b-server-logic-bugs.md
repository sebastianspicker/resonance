# Ralph Loop 3b: Server-Side Logic Bugs

You are finding and fixing logic bugs in the Resonance server that are NOT already documented in BUGS_AND_FIXES.md. Work on ONE bug per iteration.

## Context
- Routes: `server/src/routes/*.ts`
- Services: `server/src/services/entryCascade.ts`
- Auth: `server/src/auth.ts`
- Config: `server/src/config.ts`
- Storage: `server/src/storage.ts`

## Bug Categories to Hunt

1. **Race conditions:**
   - Can two concurrent requests to the same endpoint cause data corruption?
   - Are Prisma operations that should be atomic actually wrapped in `$transaction`?
   - Is the dev auth code map (`devAuthCodes`) safe under concurrent access?

2. **Error handling gaps:**
   - Are there code paths that can throw unhandled errors (bypassing the Fastify error handler)?
   - Does `cleanupS3Objects` properly handle partial failures?
   - What happens if Prisma connection is lost mid-request?

3. **State machine violations:**
   - Can an entry go from `reviewed` back to `submitted`? Should it?
   - Can feedback be posted on an already-reviewed entry?
   - What happens if an artifact is deleted while its presign URL is being used?

4. **Data integrity:**
   - Can deleting a user orphan entries/artifacts?
   - What happens if two artifacts share the same storageKey?

## For Each Bug Found

1. Document the bug briefly
2. Implement the fix
3. Write a test that would have caught it
4. Run `cd server && npm run build && npm test`
5. Commit

## Rules
- Only fix bugs you can prove exist (trace the code path, don't speculate)
- If a potential bug requires significant refactoring, document it and move on
- Do not fix bugs already addressed in BUGS_AND_FIXES.md (check first)

## Completion
When you have audited all server code paths and fixed or documented all logic bugs, output:

<promise>COMPLETE</promise>
