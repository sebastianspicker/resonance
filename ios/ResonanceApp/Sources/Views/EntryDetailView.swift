import SwiftUI
import SwiftData

struct EntryDetailView: View {
    @Bindable var entry: LocalPracticeEntry
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject var syncManager: SyncManager
    @EnvironmentObject var authManager: AuthManager
    @StateObject private var recorder = AudioRecorder()
    @StateObject private var player = AudioPlayer()

    var body: some View {
        Form {
            Section("Goal") {
                Text(entry.goalText)
                if let notes = entry.notes {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Recording") {
                if recorder.isRecording {
                    Text("Recording… \(recorder.duration, specifier: "%.1f")s")
                }
                Button(recorder.isRecording ? "Stop" : "Record Audio") {
                    recorder.isRecording ? stopRecording() : startRecording()
                }
                .buttonStyle(.borderedProminent)
            }

            Section("Artifacts") {
                ForEach(entry.artifacts) { artifact in
                    HStack {
                        Text(artifact.type.rawValue.uppercased())
                        Spacer()
                        Text(artifact.uploadState.rawValue)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button(player.isPlaying ? "Stop" : "Play") {
                            player.isPlaying ? player.stop() : player.play(url: URL(fileURLWithPath: artifact.localPath))
                        }
                    }
                }
            }

            Section("Feedback") {
                if entry.feedback.isEmpty {
                    Text("No feedback yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(entry.feedback) { feedback in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(feedback.teacherName) • \(feedback.status.rawValue)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(feedback.commentsText)
                        }
                    }
                }
            }

            Section {
                Button("Submit") {
                    submitEntry()
                }
                .disabled(entry.status == .submitted)

                Button("Delete") {
                    deleteEntry()
                }
                .foregroundStyle(.red)
            }
        }
        .navigationTitle("Entry")
        .task { await refreshFeedback() }
    }

    private func startRecording() {
        let url = FileStore.createAudioFileURL(entryId: entry.id)
        try? recorder.startRecording(to: url)
    }

    private func stopRecording() {
        recorder.stopRecording()
        guard let url = recorder.lastURL else { return }
        let artifact = LocalArtifact(id: UUID().uuidString, entryId: entry.id, type: .audio, durationSeconds: Int(recorder.duration), localPath: url.path)
        entry.artifacts.append(artifact)
        modelContext.insert(artifact)
        try? modelContext.save()
        syncManager.enqueue(type: .createArtifact, payload: ["artifactId": artifact.id])
        syncManager.enqueue(type: .uploadArtifact, payload: ["artifactId": artifact.id])
        syncManager.enqueue(type: .confirmArtifact, payload: ["artifactId": artifact.id])
    }

    private func submitEntry() {
        entry.status = .submitted
        syncManager.enqueue(type: .submitEntry, payload: ["entryId": entry.id])
        try? modelContext.save()
    }

    private func deleteEntry() {
        entry.deletedAt = Date()
        syncManager.enqueue(type: .deleteEntry, payload: ["entryId": entry.id])
        try? modelContext.save()
    }

    private func refreshFeedback() async {
        guard let session = authManager.session else { return }
        do {
            let feedbackList = try await APIClient().fetchFeedback(accessToken: session.accessToken, entryId: entry.id)
            entry.feedback.removeAll()
            for feedback in feedbackList {
                let local = LocalFeedback(id: feedback.id, targetType: feedback.targetType, targetId: feedback.targetId, teacherName: feedback.teacherName, status: FeedbackStatus(rawValue: feedback.status) ?? .ok, commentsText: feedback.commentsText)
                for marker in feedback.markers {
                    local.markers.append(LocalMarker(id: marker.id, timeSeconds: marker.timeSeconds, text: marker.text))
                }
                entry.feedback.append(local)
                modelContext.insert(local)
            }
            try? modelContext.save()
        } catch {
            print("Feedback refresh failed: \\(error)")
        }
    }
}
