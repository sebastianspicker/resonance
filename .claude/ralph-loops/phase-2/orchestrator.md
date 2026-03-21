# Phase 2 Orchestrator: Security Audit & Hardening

## Sequence
2a (Auth/authz) → 2b (Input validation) → 2c (Dependencies) → 2d (Secrets) → 2e (Headers/CORS)

## Execution

### Sub-phase 2a: Authentication & Authorization Vulnerabilities
```bash
/ralph-loop ".claude/ralph-loops/phase-2/2a-auth-authz.md" --max-iterations 10 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run build && npm test
# Verify auth.test.ts and dev-auth.test.ts pass specifically
```

### Sub-phase 2b: Input Validation Gaps
```bash
/ralph-loop ".claude/ralph-loops/phase-2/2b-input-validation.md" --max-iterations 8 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run build && npm test
```

### Sub-phase 2c: Dependency Vulnerabilities
```bash
/ralph-loop ".claude/ralph-loops/phase-2/2c-dependency-vulns.md" --max-iterations 4 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm audit --audit-level=high
cd server && npm run build && npm test
```

### Sub-phase 2d: Secret/Credential Exposure
```bash
/ralph-loop ".claude/ralph-loops/phase-2/2d-secret-exposure.md" --max-iterations 4 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
./scripts/secret-scan.sh
```

### Sub-phase 2e: Security Headers & CORS
```bash
/ralph-loop ".claude/ralph-loops/phase-2/2e-security-headers-cors.md" --max-iterations 5 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd server && npm run build && npm test
```

## Rollback Strategy
Security changes can introduce subtle behavioral changes. If tests fail after a sub-phase:
1. `git revert` commits from that sub-phase
2. Mark the sub-phase as "needs manual review" in the orchestrator log
3. Proceed to the next sub-phase

## Phase Gate
```bash
cd server && npm run lint && npm run format:check && npm run build && npm test
cd server && npm audit --audit-level=high
cd .. && ./scripts/secret-scan.sh
```
