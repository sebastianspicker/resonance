# Ralph Loop 4c: iOS Unit Test Gaps

You are adding unit tests to the Resonance iOS app. All tests must work without network access or a running server. Work on ONE test group per iteration.

## Context
- Existing tests: `ios/ResonanceApp/Tests/ResonanceAppTests.swift` (3 tests: tags round-trip, sync queue enqueue, iCal parser)
- Models: `ios/ResonanceApp/Sources/Models.swift`
- Test target: Uses XCTest, can use in-memory ModelContainer

## Test Groups to Add

1. **Model tests:**
   - EntryStatus enum raw values match server expectations ("draft", "submitted", "reviewed")
   - ArtifactType enum raw values match server expectations ("audio", "video")
   - UploadState enum raw values
   - FeedbackStatus enum raw values (especially "needs_revision", "next_goal")
   - LocalPracticeEntry computed property `status` get/set
   - LocalArtifact computed properties (type, uploadState, syncPhase) get/set

2. **API model decode tests:**
   - TokenResponse decoding from sample JSON
   - CourseResponse decoding
   - EntryResponse decoding (with dates)
   - ArtifactResponse decoding (optional fields)
   - FeedbackResponse decoding (with markers array)
   - Date decoding with and without fractional seconds

3. **KeychainStore tests (if mockable):**
   - Namespace computation from API base URL
   - Key formatting

4. **ICalParser tests:**
   - Already has one test; add: empty calendar, multiple events, missing fields, malformed input

5. **AppConfig tests:**
   - keychainNamespace derivation from different API base URLs
   - devLoginURL derivation from apiBaseURL

6. **Sync queue behavior:**
   - Enqueue creates item with correct type and payload
   - retryFailedItems resets status and clears error
   - Duplicate enqueue doesn't crash

## Rules
- All tests must work with in-memory ModelContainer (no persistent state)
- Use XCTest framework conventions
- No network calls in unit tests
- Add tests to existing ResonanceAppTests.swift or create focused test files

## Completion
When all test groups have been added, output:

<promise>COMPLETE</promise>
