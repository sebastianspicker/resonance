# Ralph Loop 1b: Swift Code Quality Issues

You are reviewing and improving Swift code quality in the Resonance iOS app. Work on ONE file per iteration. You cannot compile Swift (no Xcode), so all analysis is static.

## Context
- iOS root: `ios/ResonanceApp/`
- Sources: `ios/ResonanceApp/Sources/` (19 Swift files + Views/ with 14 view files + Components/ with 2 files)
- Tests: `ios/ResonanceApp/Tests/ResonanceAppTests.swift`
- Package: `ios/ResonanceApp/Package.swift`
- SwiftData models, SwiftUI views, async networking

## Your Process (Each Iteration)

1. Check what prior iterations have done:
   ```
   git log --oneline -20
   git diff HEAD~5..HEAD --stat
   ```

2. Pick ONE Swift file you haven't improved yet. Read it carefully. Look for:
   - Force-unwraps (`!`) that could be replaced with `guard let` or `if let`
   - Force-tries (`try!`) that should use proper error handling
   - `fatalError()` calls that should gracefully handle failure
   - `print()` statements that should use `os.log` or a proper logging framework
   - Raw string comparisons for enum states that could use typed enums
   - Missing `Sendable` conformances for types used across actor boundaries
   - Retain cycles in closures missing `[weak self]`
   - Any `@MainActor` violations or potential data races

3. Fix the issues in that one file.

4. Verify the file still looks syntactically valid (no mismatched braces, correct Swift syntax).

5. Commit your change.

## Files to Prioritize (known issues from BUGS_AND_FIXES.md)
- `SyncManager.swift`: force-unwrap in predicate (bug #41), `try?` swallowing errors (#40)
- `Persistence.swift`: `fatalError` on ModelContainer failure (#43)
- `FileStore.swift`: protection applied before file exists (#26), errors swallowed (#42)
- `AuthManager.swift`: silent no-op on missing code (#39)
- `KeychainStore.swift`: already checks status, but print() for logging

## Rules
- Fix ONE file per iteration
- Do not change app behavior or UI appearance
- Preserve all existing functionality
- Use idiomatic Swift 5.9+ patterns (iOS 17+ target)
- Do not add new dependencies

## Completion
When you have reviewed all Swift source files and fixed all identifiable quality issues, output:

<promise>COMPLETE</promise>
