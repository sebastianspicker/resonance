# Phase 5 Orchestrator: Architecture & Performance

## Sequence
5a (DB queries) → 5b (API design) → 5c (Error handling) → 5d (iOS sync)

5c (error handling) before 5d (iOS sync) because consistent error handling helps verify sync reliability.

## Execution

### Sub-phase 5a: Database Query Optimization
```bash
/ralph-loop ".claude/ralph-loops/phase-5/5a-db-query-optimization.md" --max-iterations 6 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run build && npm test
# Verify any Prisma schema changes have a migration
```

### Sub-phase 5b: API Design Improvements
```bash
/ralph-loop ".claude/ralph-loops/phase-5/5b-api-design.md" --max-iterations 6 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run build && npm test
# Verify docs/API.md is updated if endpoints changed
```

### Sub-phase 5c: Error Handling Consistency
```bash
/ralph-loop ".claude/ralph-loops/phase-5/5c-error-handling.md" --max-iterations 6 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run build && npm test
```

### Sub-phase 5d: iOS Offline-Sync Reliability
```bash
/ralph-loop ".claude/ralph-loops/phase-5/5d-ios-offline-sync.md" --max-iterations 6 --completion-promise "COMPLETE"
```
**Verification after:**
- Static only. Verify via `git diff` that changes are valid Swift.
- If server-side changes were made for idempotency: `cd server && npm run build && npm test`

## Rollback Strategy
Architecture changes are high-risk. Each commit should be independently revertable.
- Schema changes require migrations — if reverting, also revert the migration
- Use `git revert` for specific commits that break tests

## Phase Gate
```bash
cd server && npm run lint && npm run format:check && npm run build && npm test
cd .. && ./scripts/secret-scan.sh
```
