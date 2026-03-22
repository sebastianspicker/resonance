import SwiftUI
import SwiftData

struct NewEntryView: View {
    let courseId: String
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var syncManager: SyncManager
    @Environment(\.modelContext) private var modelContext

    @State private var goalText = ""
    @State private var practiceDate = Date()
    @State private var durationSeconds = ""
    @State private var tags = ""
    @State private var notes = ""
    @State private var selectedTemplateId: String = EntryTemplate.defaults.first?.id ?? ""

    var body: some View {
        NavigationStack {
            ZStack {
                AppTheme.PremiumBackground()
                
                ScrollView {
                    VStack(spacing: 24) {
                        // Template Section
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Template")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            Picker("Preset", selection: $selectedTemplateId) {
                                ForEach(EntryTemplate.defaults) { template in
                                    Text(template.name).tag(template.id)
                                }
                            }
                            .tint(.white)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityLabel("Practice template")
                            .accessibilityHint("Select a template to pre-fill the entry form")

                            Button("Apply Template") {
                                applySelectedTemplate()
                            }
                            .buttonStyle(SubtleGlassButtonStyle())
                            .frame(maxWidth: .infinity)
                            .accessibilityLabel("Apply template")
                            .accessibilityHint("Double-tap to fill in goal, tags, and notes from the selected template")
                        }
                        .glassCard()
                        
                        // Goal Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Goal")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            GlassTextField(placeholder: "Goal text", text: $goalText)
                                .accessibilityLabel("Goal text")
                                .accessibilityHint("Enter your practice goal")
                        }
                        .glassCard()

                        // Practice Section
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Practice")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            DatePicker("Date", selection: $practiceDate, displayedComponents: [.date, .hourAndMinute])
                                .colorScheme(.dark)
                            
                            HStack {
                                Text("Duration (sec)")
                                    .foregroundStyle(.white)
                                Spacer()
                                GlassTextField(placeholder: "0", text: $durationSeconds, keyboardType: .numberPad, cornerRadius: 8, width: 100)
                                    .multilineTextAlignment(.trailing)
                                    .accessibilityLabel("Duration in seconds")
                                    .accessibilityHint("Enter practice duration in seconds")
                            }
                        }
                        .glassCard()

                        // Tags Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Tags")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            GlassTextField(placeholder: "Comma-separated tags", text: $tags)
                                .accessibilityLabel("Tags")
                                .accessibilityHint("Enter comma-separated tags for this entry")
                        }
                        .glassCard()

                        // Notes Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Notes")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            GlassTextField(placeholder: "Notes", text: $notes, axis: .vertical, lineLimit: 4...8)
                                .accessibilityLabel("Notes")
                                .accessibilityHint("Enter additional notes about your practice session")
                        }
                        .glassCard()
                    }
                    .padding()
                }
            }
            .navigationTitle("New Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveEntry() }
                        .disabled(goalText.isEmpty)
                        .foregroundStyle(goalText.isEmpty ? .white.opacity(0.5) : .white)
                        .accessibilityLabel("Save entry")
                        .accessibilityHint(goalText.isEmpty ? "Enter a goal first" : "Double-tap to save this practice entry as a draft")
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.white)
                        .accessibilityLabel("Cancel")
                        .accessibilityHint("Double-tap to discard this entry and go back")
                }
            }
        }
    }

    private func saveEntry() {
        guard let session = authManager.session else { return }
        let entry = LocalPracticeEntry(
            id: UUID().uuidString,
            courseId: courseId,
            studentId: session.userId,
            practiceDate: practiceDate,
            goalText: goalText,
            durationSeconds: Int(durationSeconds),
            tags: tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) },
            notes: notes.isEmpty ? nil : notes,
            status: .draft
        )
        modelContext.insert(entry)
        do {
            try modelContext.save()
        } catch {
            appState.reportError(error)
            return
        }
        syncManager.enqueue(type: .createEntry, payload: ["entryId": entry.id])
        dismiss()
    }

    private func applySelectedTemplate() {
        guard let template = EntryTemplate.defaults.first(where: { $0.id == selectedTemplateId }) else {
            return
        }
        goalText = template.goalText
        tags = template.tags.joined(separator: ", ")
        notes = template.notes
    }
}

private struct EntryTemplate: Identifiable {
    let id: String
    let name: String
    let goalText: String
    let tags: [String]
    let notes: String

    static let defaults: [EntryTemplate] = [
        EntryTemplate(
            id: "warmup-technique",
            name: "Warmup + Technik",
            goalText: "Intonation and clean articulation in warmup patterns",
            tags: ["warmup", "technique"],
            notes: "Focus on relaxed breathing and even tone."
        ),
        EntryTemplate(
            id: "repertoire-polish",
            name: "Repertoire Polish",
            goalText: "Polish difficult measures in current repertoire",
            tags: ["repertoire", "precision"],
            notes: "Slow tempo first, then raise BPM gradually."
        ),
        EntryTemplate(
            id: "performance-run",
            name: "Performance Run",
            goalText: "Full run-through with stage-ready dynamics",
            tags: ["performance", "expression"],
            notes: "Record one uninterrupted take."
        )
    ]
}
