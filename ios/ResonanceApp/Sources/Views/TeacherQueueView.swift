import SwiftUI

extension ReviewQueueResponse: Identifiable {}


struct TeacherQueueView: View {
    let courseId: String
    @EnvironmentObject var authManager: AuthManager
    @State private var queue: [ReviewQueueResponse] = []
    @State private var selected: ReviewQueueResponse?

    var body: some View {
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
        .task { await refreshQueue() }
        .sheet(item: $selected) { entry in
            FeedbackEditorView(entry: entry)
        }
    }

    private func refreshQueue() async {
        guard let session = authManager.session else { return }
        do {
            let data = try await APIClient().fetchReviewQueue(accessToken: session.accessToken, courseId: courseId)
            queue = data
        } catch {
            print("Queue refresh failed: \(error)")
        }
    }
}
