# Ralph Loop 5d: iOS Offline-Sync Reliability

You are improving the reliability of the Resonance iOS offline sync system. All work is static analysis. Work on ONE improvement per iteration.

## Context
- SyncManager: `ios/ResonanceApp/Sources/SyncManager.swift`
- Models: `ios/ResonanceApp/Sources/Models.swift` (SyncQueueItem, LocalArtifact, etc.)
- Network: `ios/ResonanceApp/Sources/NetworkMonitor.swift`
- Auth: `ios/ResonanceApp/Sources/AuthManager.swift` (refreshIfNeeded)

## Improvements to Evaluate

1. **Queue durability:**
   - `enqueue()` uses `guard let data = try? ...` — if JSON serialization fails, the item is silently dropped. Should throw or at minimum log.
   - `saveContext()` prints errors but doesn't propagate. Should this prevent queue processing from continuing?

2. **Processing robustness:**
   - `processQueue()` fetches all pending items then processes them sequentially. If the access token expires mid-processing, remaining items will fail and get retry-delayed. Consider re-authenticating between items.
   - Background task expiration handler resets "processing" items to "pending". If the item was partially processed, this could cause duplicate creates on retry.

3. **Retry policy:**
   - Exponential backoff caps at 300 seconds (5 minutes). Is this appropriate?
   - Failed items are marked "failed" and never retried automatically. Is there a user-facing way to inspect and retry? (retryFailedItems exists)
   - What if a "pending" item's nextAttemptAt is far in the future? Is there a max retry count?

4. **Ordering guarantees:**
   - Queue items for the same entry must be processed in order: createEntry → createArtifact → uploadArtifact → confirmArtifact → submitEntry
   - Current implementation fetches all pending items without ordering guarantee.
   - Consider adding a `dependsOn` field or sorting by `createdAt`.

5. **Network awareness:**
   - `processQueue()` doesn't check `NetworkMonitor.isOnline` before starting.
   - Should sync be gated on network availability?

6. **Idempotency:**
   - If createEntry succeeds on server but SyncManager crashes before deleting the queue item, the item will be re-processed. Server should return 409 (not 500) on duplicate create.
   - Make corresponding server-side changes if needed.

## For Each Improvement

1. Analyze the current code path
2. Implement the fix (Swift code only, no compilation verification)
3. Verify the change is syntactically correct
4. If the improvement requires server-side changes (e.g., idempotent creates), make those too
5. Commit

## Rules
- Focus on reliability, not performance
- Don't redesign the entire sync system — incremental improvements
- Backward compatibility: new SyncQueueItem fields should have defaults

## Completion
When all sync reliability improvements are evaluated and implemented, output:

<promise>COMPLETE</promise>
