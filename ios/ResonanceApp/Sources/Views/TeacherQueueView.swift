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
            } else if queue.isEmpty {
                ContentUnavailableView(
                    "No submissions",
                    systemImage: "checkmark.circle",
                    description: Text("All submitted entries have been reviewed.")
                )
            } else {
                List(queue) { entry in
                    Button {
                        selected = entry
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(entry.studentName)
                                .font(.headline)
                                .foregroundStyle(.white)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                            Text(entry.goalText)
                                .foregroundStyle(.white.opacity(0.9))
                                .lineLimit(2)
                                .minimumScaleFactor(0.85)
                            HStack {
                                Text(entry.practiceDate, style: .date)
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.65))
                                Text("• \(entry.artifacts.count) artifacts")
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.65))
                            }
                        }
                        .padding(.leading, 20)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 6, leading: 14, bottom: 6, trailing: 14))
                    .listRowBackground(Color.white.opacity(0.08).cornerRadius(12).padding(.vertical, 4))
                }
                .scrollContentBackground(.hidden)
                .safeAreaPadding(.horizontal, 8)
                .listStyle(.plain)
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
