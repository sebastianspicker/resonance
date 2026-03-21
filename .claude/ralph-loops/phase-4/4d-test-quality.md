# Ralph Loop 4d: Test Quality Improvement

You are improving the quality of existing tests in the Resonance repository. Work on ONE improvement category per iteration.

## Context
- Server tests: `server/tests/*.test.ts`
- iOS tests: `ios/ResonanceApp/Tests/ResonanceAppTests.swift`
- Test config: `server/vitest.config.ts` (fileParallelism: false)

## Improvement Categories

1. **Assertion quality:**
   - Replace `expect(res.status).toBe(200)` checks with additional assertions on response body
   - Replace `.toBeDefined()` with specific value checks where possible
   - Add negative assertions (verify things that should NOT be in the response)

2. **Test isolation:**
   - Verify each test resets state properly (resetDb in beforeEach)
   - Check that tests don't depend on execution order
   - Verify s3Mock is reset between tests

3. **Test descriptions:**
   - Ensure `it()` descriptions clearly state the scenario and expected outcome
   - Follow pattern: "should [expected behavior] when [condition]"
   - Group related tests in `describe` blocks

4. **Error path coverage:**
   - For each happy-path test, ensure there's a corresponding error-path test
   - Test that error responses include correct error codes (from ErrorCodes)
   - Test that error details are safe (no stack traces, no internal data)

5. **Cleanup:**
   - Remove any duplicate tests
   - Remove any commented-out tests
   - Ensure consistent import ordering

## For Each Category

1. Review all test files for the category
2. Make improvements
3. Run `cd server && npm test`
4. Commit

## Rules
- Do not delete tests unless they are exact duplicates
- Do not change test behavior (e.g., don't weaken an assertion)
- If a test reveals a real bug, fix the bug AND the test

## Completion
When all test quality categories are addressed, output:

<promise>COMPLETE</promise>
