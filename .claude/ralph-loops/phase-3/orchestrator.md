# Phase 3 Orchestrator: Bug Detection & Fixing

## Sequence
3a (Known bugs) → 3b (Server logic) → 3c (API contracts) → 3d (iOS bugs) → 3e (Edge cases)

**Rationale:** Known bugs from BUGS_AND_FIXES.md run first to prevent re-discovery. API contracts before iOS bugs so contract fixes inform client fixes.

## Execution

### Sub-phase 3a: Known Bugs from BUGS_AND_FIXES.md
```bash
/ralph-loop ".claude/ralph-loops/phase-3/3a-known-bugs.md" --max-iterations 15 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run build && npm test
# Verify BUGS_AND_FIXES.md has been updated with fix status
```

### Sub-phase 3b: Server-Side Logic Bugs
```bash
/ralph-loop ".claude/ralph-loops/phase-3/3b-server-logic-bugs.md" --max-iterations 8 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run build && npm test
```

### Sub-phase 3c: API Contract Mismatches
```bash
/ralph-loop ".claude/ralph-loops/phase-3/3c-api-contract-mismatches.md" --max-iterations 8 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run build && npm test
# Verify iOS APIModels.swift and server response shapes are aligned by reading both
```

### Sub-phase 3d: iOS Client Bugs
```bash
/ralph-loop ".claude/ralph-loops/phase-3/3d-ios-client-bugs.md" --max-iterations 8 --completion-promise "COMPLETE"
```
**Verification after:**
- Static only. Verify via `git diff` that changes are syntactically correct Swift.

### Sub-phase 3e: Edge Cases & Boundary Conditions
```bash
/ralph-loop ".claude/ralph-loops/phase-3/3e-edge-cases.md" --max-iterations 6 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run build && npm test
```

## Rollback Strategy
Bug fixes are high-risk for regressions. Each fix is a separate commit.
If tests fail after a commit:
1. Identify the breaking commit via `git log`
2. `git revert <breaking-commit>`
3. Continue with remaining fixes

## Phase Gate
```bash
cd server && npm run lint && npm run format:check && npm run build && npm test
cd .. && ./scripts/secret-scan.sh
```
