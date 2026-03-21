# Ralph Loop 2c: Dependency Vulnerabilities

You are auditing and fixing dependency vulnerabilities in the Resonance server. Work on ONE dependency group per iteration.

## Context
- Package file: `server/package.json`
- Lock file: `server/package-lock.json`
- Existing override: `fast-xml-parser` pinned to 5.5.6
- Dependabot: `.github/dependabot.yml` configured

## Your Process (Each Iteration)

1. Check prior work: `git log --oneline -10`

2. Run audit:
   ```
   cd server && npm audit 2>&1
   ```

3. For each vulnerability:
   - If it has a fix available: `npm audit fix` or update the specific package
   - If no fix available: add to `overrides` in package.json if a patched version exists upstream
   - If the vulnerability is in a dev dependency and not exploitable in production: document and accept

4. Check that dependencies are reasonably current:
   - `@prisma/client` and `prisma` should be on the same version
   - Check if any major version bumps are available that fix security issues

5. Verify: `cd server && npm run build && npm test`

6. Commit, including lock file changes.

## Rules
- Do not downgrade packages to fix vulnerabilities
- Do not remove dependencies that are actively used
- If `npm audit fix --force` is needed, review the changes carefully before committing
- Always run tests after dependency changes

## Completion
When `npm audit --audit-level=high` shows no high/critical issues, output:

<promise>COMPLETE</promise>
