# Ralph Loop 1c: Dead Code & Unused Imports

You are removing dead code and unused imports across the entire Resonance repository. Work on ONE area per iteration.

## Context
- Server: `server/src/` (TypeScript, ESLint already flags unused vars with argsIgnorePattern: ^_)
- iOS: `ios/ResonanceApp/Sources/` (Swift, no compiler check available)
- Scripts: `scripts/` (shell scripts)
- Docs: `docs/` (markdown — check for references to removed/renamed files)

## Your Process (Each Iteration)

1. Check prior work:
   ```
   git log --oneline -10
   ```

2. Search for dead code:
   - **TypeScript:** Grep for exported functions/types that are never imported elsewhere. Check `server/src/types.ts`. Check for unused error codes in `errorCodes.ts`.
   - **Swift:** Look for functions/computed properties defined but never called. Check for unused imports. Look for unused `@Published` properties.
   - **General:** Look for commented-out code blocks, TODO code that was completed, feature flags for features that shipped.

3. Remove the dead code. For borderline cases (might be used later), leave it but add a comment.

4. Verify:
   ```
   cd server && npm run lint && npm run build && npm test
   ```

5. Commit.

## Rules
- Underscore-prefixed parameters (`_s3`, `_request`) are intentionally unused — leave them
- Do not remove code that is clearly planned for production auth (the redirectUri validation comments)
- If removing a function, grep the entire repo first to confirm it's truly unused
- Do not break tests

## Completion
When all dead code has been removed and tests still pass, output:

<promise>COMPLETE</promise>
