import SwiftUI

extension ReviewQueueResponse: Identifiable {}


struct TeacherQueueView: View {
    let courseId: String
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var authManager: AuthManager
    @State private var queue: [ReviewQueueResponse] = []
    @State private var selected: ReviewQueueResponse?
    @State private var isLoading = false

    var body: some View {
        Group {
            if isLoading && queue.isEmpty {
                ProgressView("Loading queue…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(queue) { entry in
                    Button {
                        selected = entry
                    } label: {
                        VStack(alignment: .leading) {
                            Text(entry.studentName)
                                .font(.headline)
                            Text(entry.goalText)
                            Text(entry.practiceDate, style: .date)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Refresh") { Task { await refreshQueue() } }
                    .disabled(isLoading)
            }
        }
        .task { await refreshQueue() }
        .sheet(item: $selected) { entry in
            FeedbackEditorView(entry: entry)
        }
    }

    private func refreshQueue() async {
        guard let session = authManager.session else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let data = try await appState.apiClient.fetchReviewQueue(accessToken: session.accessToken, courseId: courseId)
            queue = data
        } catch {
            appState.reportError(error)
        }
    }
}
