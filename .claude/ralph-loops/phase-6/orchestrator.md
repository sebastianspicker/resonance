# Phase 6 Orchestrator: Documentation & DevOps

## Sequence
6a (API docs) → 6b (README/Contributing) → 6c (CI/CD) → 6d (Infra)

## Execution

### Sub-phase 6a: API Documentation Accuracy
```bash
/ralph-loop ".claude/ralph-loops/phase-6/6a-api-docs-accuracy.md" --max-iterations 5 --completion-promise "COMPLETE"
```
**Verification after:**
- Read `docs/API.md` and spot-check against a few route handlers.

### Sub-phase 6b: README/CONTRIBUTING Accuracy
```bash
/ralph-loop ".claude/ralph-loops/phase-6/6b-readme-contributing.md" --max-iterations 4 --completion-promise "COMPLETE"
```
**Verification after:**
- Read README.md and verify setup commands exist in package.json.

### Sub-phase 6c: CI/CD Pipeline Improvements
```bash
/ralph-loop ".claude/ralph-loops/phase-6/6c-ci-cd-pipeline.md" --max-iterations 5 --completion-promise "COMPLETE"
```
**Verification after:**
- YAML syntax validation of workflow files.
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

### Sub-phase 6d: Infrastructure Hardening
```bash
/ralph-loop ".claude/ralph-loops/phase-6/6d-infra-hardening.md" --max-iterations 4 --completion-promise "COMPLETE"
```
**Verification after:**
```bash
cd infra && docker compose config > /dev/null 2>&1 && echo "OK" || echo "INVALID"
```

## Rollback Strategy
Documentation and DevOps changes are low-risk:
- Documentation: revert if factually incorrect
- CI: validate YAML syntax before committing; revert if workflow breaks
- Infra: validate Docker Compose config; revert if invalid

## Phase Gate
```bash
cd server && npm run lint && npm run format:check && npm run build && npm test
cd .. && ./scripts/secret-scan.sh
```
