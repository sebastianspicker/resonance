# Ralph Loop 3e: Edge Cases & Boundary Conditions

You are adding edge case handling and tests to the Resonance codebase. Work on ONE edge case category per iteration.

## Context
- Server: `server/src/routes/*.ts`, `server/tests/*.test.ts`
- Limits: `server/src/config.ts` (maxMarkers: 50, maxMarkerTextLength: 1000, bodyLimitBytes: 1MB)

## Edge Cases to Address

1. **Empty/minimal inputs:**
   - Empty string goalText, empty tags array, zero durationSeconds
   - Entry with no artifacts (can it be submitted? Currently requires at least one uploaded artifact)
   - Feedback with empty markers array, empty commentsText

2. **Maximum/boundary inputs:**
   - ID at max length (100 chars), tags array at max size, marker count at exactly 50
   - durationSeconds at MAX_SAFE_INTEGER
   - goalText at 10000 chars (default max in requireString)
   - Body at exactly 1MB limit

3. **Concurrent operations:**
   - Two simultaneous presign requests for the same artifact
   - Delete entry while submit is in progress
   - Post feedback while entry is being deleted

4. **Unicode and special characters:**
   - goalText with emoji, RTL text, null bytes, control characters
   - Tags with special characters, whitespace-only tags
   - User displayName with unicode

5. **Time-related:**
   - practiceDate in far future (year 2099), far past (year 1900)
   - Expired dev auth code (boundary: exactly at expiry time)
   - Access token at exactly 60 seconds from expiry

6. **Missing/deleted references:**
   - Feedback targeting a non-existent entry ID
   - Artifact for a deleted entry (entry.deletedAt is set)
   - Presign for an artifact whose entry was just deleted

## For Each Category

1. Write server-side tests that exercise the edge case
2. If the code handles it incorrectly, fix the code
3. Run `cd server && npm run build && npm test`
4. Commit

## Rules
- Focus on server-side tests (iOS tests would require Xcode)
- Each test should be in the most appropriate test file
- Use descriptive test names that explain the edge case
- Do not add arbitrary limits without documented rationale

## Completion
When all edge case categories are tested, output:

<promise>COMPLETE</promise>
