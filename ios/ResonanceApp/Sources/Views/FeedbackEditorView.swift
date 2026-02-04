import SwiftUI

struct MarkerDraft: Identifiable {
    let id = UUID()
    var timeSeconds: String
    var text: String
}

struct FeedbackEditorView: View {
    let entry: ReviewQueueResponse
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var status: FeedbackStatus = .ok
    @State private var commentsText: String = ""
    @State private var markers: [MarkerDraft] = []

    var body: some View {
        NavigationStack {
            Form {
                Section("Entry") {
                    Text(entry.studentName)
                    Text(entry.goalText)
                }

                Section("Status") {
                    Picker("Status", selection: $status) {
                        Text("OK").tag(FeedbackStatus.ok)
                        Text("Needs Revision").tag(FeedbackStatus.needsRevision)
                        Text("Next Goal").tag(FeedbackStatus.nextGoal)
                    }
                    .pickerStyle(.segmented)
                }

                Section("Feedback") {
                    TextField("Comments", text: $commentsText, axis: .vertical)
                }

                Section("Markers") {
                    ForEach($markers) { $marker in
                        HStack {
                            TextField("Time (s)", text: $marker.timeSeconds)
                                .keyboardType(.numberPad)
                            TextField("Note", text: $marker.text)
                        }
                    }
                    Button("Add Marker") {
                        markers.append(MarkerDraft(timeSeconds: "", text: ""))
                    }
                }
            }
            .navigationTitle("Feedback")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") { Task { await sendFeedback() } }
                        .disabled(commentsText.isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func sendFeedback() async {
        guard let session = authManager.session else { return }
        let markerModels = markers.compactMap { draft -> LocalMarker? in
            guard let seconds = Int(draft.timeSeconds), !draft.text.isEmpty else { return nil }
            return LocalMarker(id: UUID().uuidString, timeSeconds: seconds, text: draft.text)
        }
        do {
            _ = try await APIClient().createFeedback(accessToken: session.accessToken, targetType: "entry", targetId: entry.id, status: status, commentsText: commentsText, markers: markerModels)
            dismiss()
        } catch {
            print("Feedback failed: \(error)")
        }
    }
}
