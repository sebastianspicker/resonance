# Ralph Loop 5b: API Design Improvements

You are improving the API design of the Resonance server. Work on ONE improvement per iteration.

## Context
- Current API: `docs/API.md`
- Routes: `server/src/routes/*.ts`
- Error format: `server/src/errors.ts`, `server/src/errorCodes.ts`

## Improvements to Evaluate

1. **Pagination:** List endpoints (`GET /courses`, `GET /courses/:courseId/entries`, `GET /courses/:courseId/review-queue`, `GET /entries/:entryId/feedback`) return all results. Add cursor-based pagination with `limit` and `cursor` query params. Start with review-queue.

2. **Filtering:** `GET /courses/:courseId/entries` — add optional `status` query param to allow filtering by any status.

3. **Sorting:** Review queue is sorted by practiceDate desc, createdAt desc. Consider if other endpoints need explicit sort parameters.

4. **Response consistency:** Ensure all endpoints return consistent shapes. Verify top-level wrapping is consistent.

5. **Error code completeness:** Verify every error path uses a specific error code from `errorCodes.ts`, not generic strings.

6. **API versioning:** Not needed now, but document the strategy for when production auth is added.

## For Each Improvement

1. Evaluate the change's impact on the iOS client
2. If it's a breaking change, document the required iOS update
3. Implement the change
4. Update `docs/API.md`
5. Add/update tests
6. Commit

## Rules
- Non-breaking changes are strongly preferred
- Breaking changes must be clearly documented
- Update API.md for every change
- Do not remove existing functionality

## Completion
When all evaluated improvements are either implemented or documented as future work, output:

<promise>COMPLETE</promise>
