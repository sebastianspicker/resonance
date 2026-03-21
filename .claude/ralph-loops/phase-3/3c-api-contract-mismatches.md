# Ralph Loop 3c: API Contract Mismatches (Server vs iOS)

You are finding and fixing mismatches between the server API responses and the iOS client's expected types. Work on ONE endpoint per iteration.

## Context

**Server response shapes** (defined inline in route handlers):
- `routes/auth.ts`: TokenResponse (accessToken, refreshToken, user{id, displayName, globalRole})
- `routes/courses.ts`: CourseResponse, entries with artifacts, review queue
- `routes/entries.ts`: PracticeEntry model, feedback list
- `routes/artifacts.ts`: Artifact model, PresignResponse (uploadUrl, storageKey, expiresInSeconds, requiredHeaders)
- `routes/feedback.ts`: Feedback with teacherName, markers

**iOS Decodable types** (`ios/ResonanceApp/Sources/APIModels.swift`):
- TokenResponse, CourseResponse, EntryResponse, ReviewQueueResponse, ArtifactResponse, PresignResponse, FeedbackResponse, MarkerResponse

**iOS encoder/decoder** (`ios/ResonanceApp/Sources/APIClient.swift`):
- Custom date decoding (fractional + non-fractional ISO8601)

## Endpoints to Verify

For each endpoint, compare:
a. What the server actually returns (read the route handler return statement)
b. What the iOS Decodable struct expects
c. Whether field names match exactly
d. Whether field types are compatible (especially Date, optional vs required)

1. `POST /auth/session` response vs `TokenResponse`
2. `GET /courses` response vs `[CourseResponse]`
3. `GET /courses/:courseId/entries` response vs expected entry type
4. `GET /courses/:courseId/review-queue` response vs `[ReviewQueueResponse]`
5. `POST /entries/:entryId/artifacts` response vs `ArtifactResponse`
6. `POST /artifacts/:artifactId/presign` response vs `PresignResponse`
7. `POST /artifacts/:artifactId/confirm` response vs `ArtifactResponse`
8. `POST /feedback` response vs `FeedbackResponse`
9. `GET /entries/:entryId/feedback` response vs `[FeedbackResponse]`

## For Each Mismatch

1. Determine which side should change (prefer fixing the less-established side)
2. Fix server response shape OR iOS Decodable struct
3. If fixing server, add a test for the response shape
4. Commit

## Rules
- Do not change the API contract unnecessarily — only fix actual mismatches
- Extra fields in server response are fine (Decodable ignores unknown keys by default)
- Missing required fields in server response are bugs — fix on server side
- Optional vs required mismatches: prefer making the iOS side optional (more defensive)

## Completion
When all endpoints are verified and mismatches are fixed, output:

<promise>COMPLETE</promise>
