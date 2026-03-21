# Ralph Loop 1d: Code Style Consistency

You are ensuring consistent code style across the Resonance repository. Work on ONE category per iteration.

## Context
- Server formatter: Prettier (`server/.prettierrc.json`: singleQuote, trailingComma es5, printWidth 100)
- Server linter: ESLint flat config (`server/eslint.config.js`)
- Swift: No formatter configured; follow Apple's Swift API Design Guidelines

## Your Process (Each Iteration)

1. Check prior work: `git log --oneline -10`

2. Pick ONE consistency category:
   
   a. **Prettier compliance:** Run `cd server && npm run format:check`. If files are non-compliant, run `npm run format` and commit.
   
   b. **Error message tone:** Read all `ApiError` constructions across routes. Ensure messages are:
      - Sentence case, no trailing period
      - Descriptive but concise
      - Consistent verb tense
   
   c. **Import ordering:** Ensure TypeScript imports follow: external packages first, then local imports, alphabetically within groups.
   
   d. **Swift naming conventions:** Verify camelCase for properties/methods, PascalCase for types, no abbreviations in public API.
   
   e. **Route handler structure:** Ensure all route handlers follow the same pattern: parse params → validate auth → validate body → business logic → return response.

3. Fix inconsistencies in that category.

4. Verify: `cd server && npm run lint && npm run build && npm test`

5. Commit.

## Rules
- Style changes only — do not change logic
- When in doubt, match the existing majority pattern
- Do not add a Swift formatter or change existing tool configs

## Completion
When all style categories have been addressed, output:

<promise>COMPLETE</promise>
