# CI Audit

## Scope
- Workflows inspected: `CI`, `CodeQL`
- Last known failures were pulled from the GitHub Actions API (run list). Job logs could not be downloaded due to missing admin permissions, so root-cause was inferred from local reproduction where possible.

## Failure Summary
| Workflow | Failure(s) | Root Cause | Fix Plan | Risk | How to Verify |
| --- | --- | --- | --- | --- | --- |
| CI | `Secret scan` failed on `main` (2026-02-05) | The secret scan matched its own pattern strings inside `scripts/secret-scan.sh`. | Exclude `scripts/secret-scan.sh` from the scan. | Low | Run `./scripts/secret-scan.sh` locally and re-run CI. |
| CodeQL | None (recent runs succeeded) | N/A | N/A | Low | N/A |

## Notes
- The GitHub API allows listing runs without auth, but downloading job logs requires admin rights. If needed, re-run CI after changes to confirm full green status.
