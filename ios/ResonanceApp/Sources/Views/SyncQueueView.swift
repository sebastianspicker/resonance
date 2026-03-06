import SwiftUI
import SwiftData

struct SyncQueueView: View {
    @EnvironmentObject var syncManager: SyncManager
    @Query(sort: \SyncQueueItem.createdAt, order: .reverse) private var queueItems: [SyncQueueItem]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text("Pending")
                        Spacer()
                        Text("\(syncManager.pendingQueueCount)")
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Text("Failed")
                        Spacer()
                        Text("\(syncManager.failedQueueCount)")
                            .foregroundStyle(.secondary)
                    }
                }

                ForEach(queueItems) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.type)
                            .font(.subheadline.weight(.semibold))
                        Text("status: \(item.status)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let lastError = item.lastError, item.status == "failed" {
                            Text(friendlyError(lastError))
                                .font(.caption2)
                                .foregroundStyle(.red)
                                .lineLimit(3)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(item.type), \(item.status)")
                }
            }
            .navigationTitle("Sync Queue")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Process") {
                        Task { await syncManager.processQueue() }
                    }
                    .accessibilityHint("Processes all pending sync items")
                }
                ToolbarItem(placement: .automatic) {
                    Button("Retry Failed") {
                        syncManager.retryFailedItems()
                    }
                    .disabled(syncManager.failedQueueCount == 0)
                    .accessibilityHint("Resets failed items so they can be retried")
                }
            }
        }
    }

    private func friendlyError(_ raw: String) -> String {
        let lowered = raw.lowercased()
        if lowered.contains("urlerror") || lowered.contains("network") || lowered.contains("timed out") || lowered.contains("not connected") {
            return "Network connection failed. Check your internet."
        }
        if lowered.contains("invalid_token") || lowered.contains("401") || lowered.contains("expired") {
            return "Session expired. Sign out and sign in again."
        }
        if lowered.contains("validation_error") || lowered.contains("400") {
            return "Server rejected this data. Check the entry fields."
        }
        if lowered.contains("localfilenotfound") || lowered.contains("no such file") {
            return "Recording file was lost. Re-record the audio."
        }
        return raw
    }
}
