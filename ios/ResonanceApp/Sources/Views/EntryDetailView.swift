import SwiftUI
import SwiftData

struct EntryDetailView: View {
    @Bindable var entry: LocalPracticeEntry
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var syncManager: SyncManager
    @EnvironmentObject var authManager: AuthManager
    @StateObject private var recorder = AudioRecorder()
    @StateObject private var player = AudioPlayer()
    @State private var isLoadingFeedback = false
    @State private var showDeleteConfirmation = false

    var body: some View {
        ZStack {
            AppTheme.PremiumBackground()
            
            ScrollView {
                VStack(spacing: 24) {
                    // Status
                    HStack {
                        Text("Entry status")
                            .font(.headline)
                            .foregroundStyle(.white)
                        Spacer()
                        Text(statusLabel(entry.status))
                            .font(.caption.weight(.bold))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(statusColor(entry.status).opacity(0.2))
                            .foregroundStyle(statusColor(entry.status))
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(statusColor(entry.status).opacity(0.5), lineWidth: 1))
                    }
                    .glassCard()
                    
                    // Goal
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Goal")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.6))
                            .textCase(.uppercase)
                        Text(entry.goalText)
                            .font(.title3.weight(.medium))
                            .foregroundStyle(.white)
                        if let notes = entry.notes {
                            Text(notes)
                                .font(.body)
                                .foregroundStyle(.white.opacity(0.7))
                                .padding(.top, 4)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .glassCard()

                    // Recording
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recording")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.6))
                            .textCase(.uppercase)
                        
                        if recorder.isRecording {
                            HStack {
                                Circle()
                                    .fill(Color.red)
                                    .frame(width: 12, height: 12)
                                    .scaleEffect(recorder.isRecording ? 1.2 : 1.0)
                                    .animation(.easeInOut(duration: 0.8).repeatForever(), value: recorder.isRecording)
                                Text("Recording… \(recorder.duration, specifier: "%.1f")s")
                                    .font(.headline)
                                    .foregroundStyle(.white)
                            }
                            .padding(.bottom, 8)
                        }
                        
                        if recorder.isRecording {
                            Button(action: stopRecording) {
                                HStack {
                                    Image(systemName: "stop.fill")
                                    Text("Stop Recording")
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(SubtleGlassButtonStyle())
                        } else {
                            Button(action: startRecording) {
                                HStack {
                                    Image(systemName: "mic.fill")
                                    Text("Record Audio")
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(VibrantGlassButtonStyle())
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .glassCard()

                    // Artifacts
                    if !entry.artifacts.isEmpty {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Artifacts")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            ForEach(entry.artifacts) { artifact in
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(artifact.type.rawValue.uppercased())
                                            .font(.headline)
                                            .foregroundStyle(.white)
                                        Text(artifact.syncPhase.rawValue.capitalized)
                                            .font(.caption)
                                            .foregroundStyle(.white.opacity(0.5))
                                    }
                                    Spacer()
                                    Button(player.isPlaying ? "Stop" : "Play") {
                                        player.isPlaying ? player.stop() : player.play(url: URL(fileURLWithPath: artifact.localPath))
                                    }
                                    .buttonStyle(SubtleGlassButtonStyle())
                                }
                                if artifact.id != entry.artifacts.last?.id {
                                    Divider().background(Color.white.opacity(0.2))
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .glassCard()
                    }

                    // Feedback
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Feedback")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.6))
                            .textCase(.uppercase)
                        
                        if isLoadingFeedback {
                            ProgressView()
                                .tint(.white)
                                .frame(maxWidth: .infinity)
                        } else if entry.feedback.isEmpty {
                            Text("No feedback yet")
                                .foregroundStyle(.white.opacity(0.5))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            ForEach(entry.feedback) { feedback in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        Text(feedback.teacherName)
                                            .font(.headline)
                                            .foregroundStyle(.white)
                                        Spacer()
                                        Text(feedback.status.rawValue)
                                            .font(.caption.weight(.bold))
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.white.opacity(0.1))
                                            .clipShape(Capsule())
                                            .foregroundStyle(.white.opacity(0.8))
                                    }
                                    Text(feedback.commentsText)
                                        .font(.body)
                                        .foregroundStyle(.white.opacity(0.9))
                                }
                                .padding()
                                .background(Color.white.opacity(0.05))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .glassCard()

                    // Actions
                    VStack(spacing: 16) {
                        Button("Submit") {
                            submitEntry()
                        }
                        .buttonStyle(VibrantGlassButtonStyle())
                        .disabled(entry.status != .draft)
                        .opacity(entry.status != .draft ? 0.5 : 1.0)

                        Button("Delete") {
                            showDeleteConfirmation = true
                        }
                        .buttonStyle(SubtleGlassButtonStyle())
                        .foregroundStyle(.red)
                    }
                    .padding(.top, 16)
                    .padding(.bottom, 40)
                }
                .padding()
            }
        }
        .navigationTitle("EntryDetail")
        .navigationBarTitleDisplayMode(.inline)
        .task { await refreshFeedback() }
        .alert("Delete entry?", isPresented: $showDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { deleteEntry() }
        } message: {
            Text("This removes the entry and queued uploads. This action cannot be undone.")
        }
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
        isLoadingFeedback = true
        defer { isLoadingFeedback = false }
        do {
            let feedbackList = try await appState.apiClient.fetchFeedback(accessToken: session.accessToken, entryId: entry.id)
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
            appState.reportError(error)
        }
    }

    private func statusLabel(_ status: EntryStatus) -> String {
        switch status {
        case .draft:
            return "Draft"
        case .submitted:
            return "Submitted"
        case .reviewed:
            return "Reviewed"
        }
    }

    private func statusColor(_ status: EntryStatus) -> Color {
        switch status {
        case .draft:
            return .secondary
        case .submitted:
            return .orange
        case .reviewed:
            return .green
        }
    }
}
