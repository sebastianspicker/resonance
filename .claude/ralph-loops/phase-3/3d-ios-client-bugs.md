# Ralph Loop 3d: iOS Client Bugs

You are finding and fixing bugs in the Resonance iOS app. All analysis is static (no Xcode). Work on ONE bug per iteration.

## Context
- App entry: `ios/ResonanceApp/Sources/ResonanceApp.swift`
- State: `AppState.swift`, `AuthManager.swift`, `SyncManager.swift`, `NetworkMonitor.swift`
- Data: `Models.swift`, `APIModels.swift`, `APIClient.swift`
- Storage: `FileStore.swift`, `KeychainStore.swift`, `Persistence.swift`
- Views: `ios/ResonanceApp/Sources/Views/*.swift`

## Bug Categories

1. **State management:**
   - Are there @Published properties updated off the @MainActor?
   - Can AppState get into an inconsistent state?
   - Are there view state bugs (showing stale data after sync)?

2. **Sync reliability:**
   - SyncManager processes queue items sequentially — what if one blocks?
   - Background task expiration handler resets "processing" items — is that safe?
   - Queue metrics use `(try? ...) ?? []` — failure is indistinguishable from empty

3. **Memory/lifecycle:**
   - Does NetworkMonitor properly clean up on deinit?
   - Are there Tasks that outlive their parent view?
   - URLSession with background configuration: is it properly configured?

4. **Data consistency:**
   - LocalPracticeEntry stores tags as CSV string but encodes/decodes via JSON — what if JSON encode fails?
   - SwiftData cascade deletes: are relationships configured correctly?
   - Can duplicate SyncQueueItems be created for the same operation?

5. **UI bugs:**
   - Are there views that don't handle empty states?
   - Date formatting consistency across views
   - Accessibility labels on interactive elements

## For Each Bug

1. Read the relevant file(s) carefully
2. Identify the bug with a clear explanation
3. Fix it using idiomatic Swift
4. Verify the fix is syntactically correct
5. Commit

## Rules
- Static analysis only — you cannot compile or run the app
- Focus on correctness bugs, not cosmetic issues
- Do not refactor working code just because you'd write it differently
- When fixing tag encoding, preserve backward compatibility with existing data

## Completion
When all identifiable iOS bugs are fixed, output:

<promise>COMPLETE</promise>
