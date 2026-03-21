# Ralph Loop 5a: Database Query Optimization

You are optimizing database queries in the Resonance server. Work on ONE optimization per iteration.

## Context
- Schema: `server/prisma/schema.prisma` (8 models, indexes on foreign keys)
- Routes use Prisma Client for all DB access
- Current indexes: Membership(userId, courseId), PracticeEntry(courseId, studentId, status), Artifact(entryId), Feedback(targetId+targetType, teacherId), Marker(feedbackId), RefreshToken(userId, tokenHash)

## Optimizations to Evaluate

1. **N+1 query patterns:**
   - `GET /courses/:courseId/entries` uses `include: { artifacts: true }` — does it need feedback too?
   - `cascadeDeleteEntry` fetches artifacts, then feedback for those artifacts — could this be a single query?

2. **Missing indexes:**
   - `PracticeEntry.deletedAt` — frequently filtered by `deletedAt: null` but no index
   - `RefreshToken.revokedAt` — queried in logout (`revokedAt: null`), could benefit from partial index

3. **Query efficiency:**
   - `requireCourseRole` is called on nearly every request — is the result cached within a request?
   - `requireEntryAccess` calls `requireCourseRole` internally — double membership lookup on some routes
   - Review queue could use `select` instead of `include` to limit returned fields

4. **Prisma-specific:**
   - Could `findUniqueOrThrow` replace `findUnique` + null check patterns?
   - Is `$transaction` used appropriately (interactive vs batch)?

5. **Pagination:**
   - None of the list endpoints are paginated. Document the gap.
   - If adding cursor-based pagination, start with review-queue.

## For Each Optimization

1. Identify the current query pattern
2. Measure or estimate the impact
3. Implement the optimization
4. If adding an index, create a Prisma migration: `cd server && npx prisma migrate dev --name <description>`
5. Run tests
6. Commit

## Rules
- Do not change API response shapes (those are the client's contract)
- Index additions require Prisma migrations
- Prefer Prisma fluent API over raw SQL
- Do not prematurely optimize — focus on provable N+1s and missing indexes

## Completion
When all query patterns are optimized and indexed appropriately, output:

<promise>COMPLETE</promise>
