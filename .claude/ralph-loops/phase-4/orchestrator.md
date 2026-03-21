# Phase 4 Orchestrator: Test Coverage & Quality

## Sequence
4a (Server unit tests) → 4b (Server integration tests) → 4c (iOS unit tests) → 4d (Test quality)

## Execution

### Sub-phase 4a: Server Unit Test Gaps
```bash
/ralph-loop ".claude/ralph-loops/phase-4/4a-server-unit-tests.md" --max-iterations 10 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm test
```

### Sub-phase 4b: Server Integration Test Gaps
```bash
/ralph-loop ".claude/ralph-loops/phase-4/4b-server-integration-tests.md" --max-iterations 10 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm test
```

### Sub-phase 4c: iOS Unit Test Gaps
```bash
/ralph-loop ".claude/ralph-loops/phase-4/4c-ios-unit-tests.md" --max-iterations 6 --completion-promise "COMPLETE"
```
**Verification after:**
- Static only. Verify via `git diff` that test file changes are valid Swift.

### Sub-phase 4d: Test Quality Improvement
```bash
/ralph-loop ".claude/ralph-loops/phase-4/4d-test-quality.md" --max-iterations 5 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm test
```

## Rollback Strategy
Test additions are low-risk. If a test reveals a real bug:
1. Fix the bug (don't remove the test)
2. Commit the bug fix and the test together

## Phase Gate
```bash
cd server && npm run lint && npm run format:check && npm run build && npm test
cd .. && ./scripts/secret-scan.sh
```
