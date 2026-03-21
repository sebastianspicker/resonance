# Phase 1 Orchestrator: Static Analysis & Code Quality

## Sequence
1a (TS lint/types) → 1b (Swift quality) → 1c (Dead code) → 1d (Style consistency)

## Execution

### Sub-phase 1a: TypeScript Lint & Type Issues
```bash
/ralph-loop ".claude/ralph-loops/phase-1/1a-ts-lint-types.md" --max-iterations 8 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run lint && npm run build && npm test
```

### Sub-phase 1b: Swift Code Quality
```bash
/ralph-loop ".claude/ralph-loops/phase-1/1b-swift-quality.md" --max-iterations 10 --completion-promise "COMPLETE"
```
**Verification after:**
- Static only (no compiler). Verify via `git diff` that only `.swift` files changed and changes are syntactically reasonable.

### Sub-phase 1c: Dead Code & Unused Imports
```bash
/ralph-loop ".claude/ralph-loops/phase-1/1c-dead-code.md" --max-iterations 5 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run lint && npm run build && npm test
```

### Sub-phase 1d: Style Consistency
```bash
/ralph-loop ".claude/ralph-loops/phase-1/1d-style-consistency.md" --max-iterations 5 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run lint && npm run format:check && npm test
```

## Rollback Strategy
Each sub-phase produces a series of commits. If verification fails after a sub-phase:
1. Identify commits from the failed sub-phase via `git log`
2. `git revert` those commits (in reverse order)
3. Skip the failed sub-phase and proceed to the next

## Phase Gate
After all sub-phases complete, run the full gate check:
```bash
cd server && npm run lint && npm run format:check && npm run build && npm test
cd .. && ./scripts/secret-scan.sh
```
