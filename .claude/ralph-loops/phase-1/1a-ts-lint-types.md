# Ralph Loop 1a: TypeScript Server Lint & Type Issues

You are fixing TypeScript lint and type errors in the Resonance server. Work on ONE issue per iteration.

## Context
- Server root: `server/`
- Source: `server/src/` (index.ts, server.ts, auth.ts, config.ts, storage.ts, validation.ts, errors.ts, errorCodes.ts, types.ts, routes/*.ts, services/*.ts)
- Tests: `server/tests/*.test.ts`
- ESLint config: `server/eslint.config.js` (flat config, @typescript-eslint)
- TSConfig: `server/tsconfig.json` (strict: true, ES2022, Bundler resolution)
- Prettier: `server/.prettierrc.json` (singleQuote, trailingComma es5, printWidth 100)

## Your Process (Each Iteration)

1. Check what prior iterations have done:
   ```
   git log --oneline -20
   git diff HEAD~5..HEAD --stat
   ```

2. Run the linter and type checker to find remaining issues:
   ```
   cd server && npm run lint 2>&1 | head -80
   cd server && npm run build 2>&1 | head -80
   ```

3. Pick ONE issue from the output and fix it. Typical issues:
   - `@typescript-eslint/no-unused-vars` warnings
   - Missing type annotations on function parameters or return types
   - `any` types that could be narrowed
   - Type assertions (`as`) that could be replaced with proper type guards
   - The `request.user!` non-null assertion pattern (consider making it type-safe)

4. After fixing, verify:
   ```
   cd server && npm run lint && npm run build && npm test
   ```

5. Commit your change with a descriptive message.

## Rules
- Fix only ONE issue per iteration
- Never break existing tests
- Do not change behavior — only improve types and lint compliance
- Do not modify eslint.config.js or tsconfig.json to suppress warnings
- If `npm run lint` and `npm run build` produce zero errors/warnings, you are done

## Completion
When lint and build produce zero issues and all tests pass, output:

<promise>COMPLETE</promise>
