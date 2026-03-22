# Master Orchestrator: Resonance Full Repo Improvement

## Overview
This orchestrator coordinates 6 phases of iterative improvement across the entire Resonance repository. Each phase contains multiple Ralph Loop sub-phases that run sequentially.

**Total sub-phases:** 24
**Total max iterations:** 172

## Phase Execution Order

```
Phase 1 (Code Quality)     → No dependencies
Phase 2 (Security)         → Depends on Phase 1
Phase 3 (Bug Fixing)       → Depends on Phase 2
Phase 4 (Test Coverage)    → Depends on Phase 3
Phase 5 (Architecture)     → Depends on Phase 4
Phase 6 (Docs & DevOps)    → Depends on Phase 5
```

## Execution Instructions

### Before Starting
1. Ensure Docker is running (for test database)
2. Ensure `server/node_modules` is installed: `cd server && npm ci`
3. Run the gate check to verify clean starting state:
   ```bash
   .claude/ralph-loops/gate-check.sh
   ```

### Running Each Phase
For each phase (1 through 6):

1. Read the phase orchestrator: `.claude/ralph-loops/phase-N/orchestrator.md`
2. Execute each sub-phase Ralph Loop in the specified order
3. Run the inter-sub-phase verification after each sub-phase
4. After all sub-phases complete, run the gate check:
   ```bash
   .claude/ralph-loops/gate-check.sh
   ```
5. Only proceed to the next phase if the gate passes

### Running a Sub-phase
```bash
/ralph-loop ".claude/ralph-loops/phase-N/Na-name.md" --max-iterations <N> --completion-promise "COMPLETE"
```

## Gate Check Script
Located at: `.claude/ralph-loops/gate-check.sh`

Runs:
- `npm run lint` — zero warnings
- `npm run format:check` — Prettier compliance
- `npm run build` — TypeScript compiles
- `npm test` — all tests pass
- `./scripts/secret-scan.sh` — no exposed secrets

## Failure Handling

### Sub-phase hits max iterations without COMPLETE
- Log as incomplete in the orchestrator notes
- Run the inter-sub-phase verification
- If verification passes: continue to next sub-phase
- If verification fails: revert commits from failed sub-phase, skip it

### Sub-phase breaks tests
- Identify which commit broke tests via `git log`
- `git revert <breaking-commit>`
- Continue with remaining sub-phases

### Phase gate fails
- Identify breaking commit via `git bisect`:
  ```bash
  git bisect start HEAD <last-known-good-commit>
  git bisect run .claude/ralph-loops/gate-check.sh
  ```
- Revert the identified commit
- Re-run gate check

### Cross-phase regression
- Do NOT proceed to next phase
- Investigate and fix within current phase context
- Re-run gate check

## Global Completion Criteria

The system is complete when ALL of:
1. All 24 sub-phases emitted `<promise>COMPLETE</promise>` (or explicitly skipped with rationale)
2. All 6 inter-phase gates passed
3. `cd server && npm run lint && npm run build && npm test` passes
4. `./scripts/secret-scan.sh` passes
5. `docs/BUGS_AND_FIXES.md` has all items with current status
6. `docs/API.md` matches actual implementation

## Phase Summary

| Phase | Sub-phases | Total Max Iterations | Focus |
|-------|-----------|---------------------|-------|
| 1 | 1a, 1b, 1c, 1d | 28 | Code quality, lint, style |
| 2 | 2a, 2b, 2c, 2d, 2e | 31 | Security hardening |
| 3 | 3a, 3b, 3c, 3d, 3e | 45 | Bug detection & fixing |
| 4 | 4a, 4b, 4c, 4d | 31 | Test coverage & quality |
| 5 | 5a, 5b, 5c, 5d | 24 | Architecture & performance |
| 6 | 6a, 6b, 6c, 6d | 18 | Documentation & DevOps |
| **Total** | **24** | **177** | |

## Progress Log

Track progress here as phases complete:

- [x] Phase 1: Code Quality — Complete. Dead code removal, import ordering, error message normalization, Prettier formatting.
- [x] Phase 2: Security — Complete. JWT constraints, rate limiting, Helmet headers, Content-Type enforcement, input validation, client ID validation, npm audit clean.
- [x] Phase 3: Bug Fixing — Complete. Fixed bugs #4, #5, #20, #31-35, #37-39, #41, #43-44, #48. iOS: SyncManager fixes, orphaned objects, date ranges.
- [x] Phase 4: Test Coverage — Complete. 25 to 255 server tests, 49 iOS XCTest tests. Unit, integration, and edge-case coverage.
- [x] Phase 5: Architecture — Complete. Redundant membership query elimination, composite index, narrowed relation includes, error handling consistency.
- [x] Phase 6: Docs & DevOps — Complete. API.md rewrite, .nvmrc, npm audit in CI, ci-local.sh, Docker health checks, docs fixes.
