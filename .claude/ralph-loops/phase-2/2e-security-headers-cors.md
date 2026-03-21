# Ralph Loop 2e: Security Headers & CORS Hardening

You are auditing and hardening HTTP security headers and CORS configuration in the Resonance server. Work on ONE area per iteration.

## Context
- Server setup: `server/src/server.ts` (Fastify with @fastify/cors, @fastify/helmet, @fastify/rate-limit)
- Config: `server/src/config.ts` (corsOrigins parsed from CORS_ORIGINS env var)
- Rate limit: 100 requests per minute globally
- Tests: `server/tests/cors.test.ts`

## Areas to Audit

1. **Helmet configuration:** Review if additional options are needed:
   - Content-Security-Policy for API responses
   - X-Content-Type-Options
   - Strict-Transport-Security for production
   - X-Frame-Options

2. **CORS specifics:** Verify CORS test coverage. Check if credentials are properly handled. Verify preflight behavior.

3. **Rate limiting:** Consider:
   - Auth endpoints should have stricter limits (e.g., 10/min for /auth/session, /auth/refresh)
   - File presign/confirm should have per-user limits
   - Health endpoint should be exempt

4. **Response headers:** Check that error responses don't leak server info (Fastify version, stack traces). Verify the error handler in `server.ts` only exposes safe details.

5. **Request validation:** Check bodyLimit (1MB). Verify Content-Type enforcement on POST/PATCH routes.

## For Each Area

1. Read the relevant code
2. Identify gaps
3. Implement fixes
4. Add/update tests
5. Run `cd server && npm run build && npm test`
6. Commit

## Rules
- Do not break the development workflow (localhost must still work)
- Rate limits should be configurable via environment variables where practical
- Test CORS changes thoroughly

## Completion
When all security header areas are hardened and tested, output:

<promise>COMPLETE</promise>
