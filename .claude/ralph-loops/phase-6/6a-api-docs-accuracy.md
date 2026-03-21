# Ralph Loop 6a: API Documentation Accuracy

You are ensuring `docs/API.md` accurately reflects the current server implementation. Work on ONE endpoint group per iteration.

## Context
- API docs: `docs/API.md`
- Routes: `server/src/routes/*.ts`
- Error codes: `server/src/errorCodes.ts`
- Response shapes: inferred from route handler return statements

## Your Process (Each Iteration)

1. Pick ONE endpoint group (Auth, Courses, Entries, Artifacts, Feedback)

2. For each endpoint in the group:
   a. Read the route handler code to see the actual request/response format
   b. Read the corresponding section in API.md
   c. Document any differences

3. Update API.md to match the implementation. Include:
   - HTTP method and path
   - Auth requirement (Bearer token? Dev-only? Public?)
   - Request body (with types and required/optional markers)
   - Response body (with actual field names and types)
   - Error responses (with error codes and HTTP status codes)
   - Side effects (e.g., feedback marks entry as reviewed)

4. Commit

## Specific Things to Check
- POST /auth/logout may not be documented
- GET /auth/me may not be documented
- Presign response includes `requiredHeaders` (was added later)
- Entry lifecycle now includes `reviewed` status
- Review queue ordering is documented
- Dev auth localhost-only restriction is documented

## Rules
- API.md should be the definitive API reference — accurate and complete
- Use consistent formatting (code blocks for request/response bodies)
- Include all error codes that each endpoint can return
- Do not change the API implementation — only the docs
- Write in the existing documentation style

## Completion
When API.md fully and accurately documents every endpoint, output:

<promise>COMPLETE</promise>
