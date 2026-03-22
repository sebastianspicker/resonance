import SwiftUI

struct MarkerDraft: Identifiable {
    let id = UUID()
    var timeSeconds: String
    var text: String
}

struct FeedbackEditorView: View {
    let entry: ReviewQueueEntry
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var status: FeedbackStatus = .ok
    @State private var commentsText: String = ""
    @State private var markers: [MarkerDraft] = []
    @State private var isSending = false
    @State private var markerValidationError: String?

    var body: some View {
        NavigationStack {
            ZStack {
                AppTheme.PremiumBackground()
                
                ScrollView {
                    VStack(spacing: 24) {
                        // Entry Section
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Entry")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            Text(entry.studentName)
                                .font(.title3.weight(.bold))
                                .foregroundStyle(.white)
                            Text(entry.goalText)
                                .font(.body)
                                .foregroundStyle(.white.opacity(0.8))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .glassCard()

                        // Status Section
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Status")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            Picker("Status", selection: $status) {
                                Text("OK").tag(FeedbackStatus.ok)
                                Text("Needs Revision").tag(FeedbackStatus.needsRevision)
                                Text("Next Goal").tag(FeedbackStatus.nextGoal)
                            }
                            .pickerStyle(.segmented)
                            .colorScheme(.dark)
                            .accessibilityLabel("Feedback status")
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .glassCard()

                        // Feedback Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Feedback")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            GlassTextField(placeholder: "Comments", text: $commentsText, axis: .vertical, lineLimit: 4...8)
                        }
                        .glassCard()

                        // Snippets Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Snippets")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(FeedbackSnippet.defaults, id: \.self) { snippet in
                                        Button(snippet) {
                                            if commentsText.isEmpty {
                                                commentsText = snippet
                                            } else {
                                                commentsText += " " + snippet
                                            }
                                        }
                                        .buttonStyle(SubtleGlassButtonStyle())
                                        .accessibilityHint("Appends this text to comments")
                                    }
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .glassCard()

                        // Markers Section
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Markers")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            ForEach($markers) { $marker in
                                HStack {
                                    GlassTextField(placeholder: "Time (s)", text: $marker.timeSeconds, keyboardType: .numberPad, cornerRadius: 8, width: 80)
                                        .accessibilityLabel("Marker time in seconds")

                                    GlassTextField(placeholder: "Note", text: $marker.text, cornerRadius: 8)
                                        .accessibilityLabel("Marker note")
                                }
                            }
                            Button("Add Marker") {
                                markers.append(MarkerDraft(timeSeconds: "", text: ""))
                            }
                            .buttonStyle(SubtleGlassButtonStyle())
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .glassCard()
                    }
                    .padding(.vertical, 16)
                    .padding(.horizontal, 20)
                }
                .safeAreaPadding(.horizontal, 8)
            }
            .navigationTitle("Feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") { Task { await sendFeedback() } }
                        .disabled(commentsText.isEmpty || isSending)
                        .foregroundStyle(commentsText.isEmpty || isSending ? .white.opacity(0.5) : .white)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.white)
                }
            }
            .alert("Invalid Markers", isPresented: .init(
                get: { markerValidationError != nil },
                set: { if !$0 { markerValidationError = nil } }
            )) {
                Button("OK") { markerValidationError = nil }
            } message: {
                Text(markerValidationError ?? "")
            }
        }
    }

    private func sendFeedback() async {
        guard !isSending, let session = authManager.session else { return }

        // Validate markers: reject incomplete or invalid entries instead of
        // silently dropping them, which could cause the teacher to lose work.
        let nonEmptyMarkers = markers.filter { !$0.timeSeconds.isEmpty || !$0.text.isEmpty }
        for marker in nonEmptyMarkers {
            if marker.timeSeconds.isEmpty {
                markerValidationError = "Each marker needs a time value."
                return
            }
            guard let seconds = Int(marker.timeSeconds), seconds >= 0 else {
                markerValidationError = "Marker time must be a non-negative number."
                return
            }
            if marker.text.isEmpty {
                markerValidationError = "Each marker needs a note."
                return
            }
        }

        isSending = true
        defer { isSending = false }

        let markerModels = nonEmptyMarkers.map { draft in
            // Force-unwrap is safe: validation above guarantees Int conversion succeeds.
            LocalMarker(id: UUID().uuidString, timeSeconds: Int(draft.timeSeconds)!, text: draft.text)
        }
        do {
            _ = try await appState.apiClient.createFeedback(accessToken: session.accessToken, targetType: "entry", targetId: entry.id, status: status, commentsText: commentsText, markers: markerModels)
            dismiss()
        } catch {
            appState.reportError(error)
        }
    }
}

private enum FeedbackSnippet {
    static let defaults: [String] = [
        "Strong musical phrasing.",
        "Great rhythm stability.",
        "Please slow down and clean articulation.",
        "Watch intonation in longer notes.",
        "Excellent progress since last submission."
    ]
}
