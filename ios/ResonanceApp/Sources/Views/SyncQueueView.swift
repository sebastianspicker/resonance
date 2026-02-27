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
                            Text(lastError)
                                .font(.caption2)
                                .foregroundStyle(.red)
                                .lineLimit(3)
                        }
                    }
                }
            }
            .navigationTitle("Sync Queue")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Process") {
                        Task { await syncManager.processQueue() }
                    }
                }
                ToolbarItem(placement: .automatic) {
                    Button("Retry Failed") {
                        syncManager.retryFailedItems()
                    }
                    .disabled(syncManager.failedQueueCount == 0)
                }
            }
        }
    }
}
