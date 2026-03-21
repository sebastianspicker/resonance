# Ralph Loop 5c: Error Handling Consistency

You are ensuring consistent error handling across the Resonance server. Work on ONE area per iteration.

## Context
- Error system: `server/src/errors.ts` (ApiError class, sendError function with safe detail filtering)
- Error codes: `server/src/errorCodes.ts`
- Global error handler: `server/src/server.ts` (catches ApiError, logs all others, returns generic 500)
- Fastify logger: pino with redaction of auth headers and body fields

## Areas to Audit

1. **Route handlers:** Every route handler should either:
   - Return a success response, OR
   - Throw an `ApiError` with specific code from `ErrorCodes`
   - Never throw raw `Error` (the global handler catches it but returns generic 500)

2. **Prisma errors:** What happens when Prisma throws? Common cases:
   - Unique constraint violation (duplicate ID) — should return 409
   - Record not found (in update/delete) — should return 404
   - Connection error — should log and return 500 (global handler)

3. **S3 errors:** What happens when S3 operations fail? Check:
   - presign URL generation failure
   - HeadObject failure in confirm
   - ensureBucket error handling

4. **Validation errors:** Are all validation paths covered? Check for:
   - Missing body (body is null/undefined)
   - Wrong Content-Type header
   - Malformed JSON body

5. **Consistent error response shape:** Verify every error path returns `{ error: { code, message, details } }`. The `sendError` function already filters details to safe keys. Verify no route sends errors in a different format.

6. **Logging:** Verify error logging:
   - All 500s are logged with request context
   - 4xx errors are NOT logged at error level (they're client errors)
   - No sensitive data in error logs

## For Each Area

1. Trace all error paths in the relevant code
2. Fix inconsistencies
3. Add tests for error paths
4. Run `cd server && npm run build && npm test`
5. Commit

## Rules
- Use existing ApiError and ErrorCodes — do not create parallel error systems
- Add new error codes to errorCodes.ts as needed
- Error messages should be helpful to API consumers but not leak internals

## Completion
When all error paths are consistent and tested, output:

<promise>COMPLETE</promise>
