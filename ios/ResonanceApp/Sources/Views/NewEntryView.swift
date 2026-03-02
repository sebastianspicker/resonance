import SwiftUI
import SwiftData

struct NewEntryView: View {
    let courseId: String
    @Environment(\.dismiss) private var dismiss
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
                            
                            Button("Apply Template") {
                                applySelectedTemplate()
                            }
                            .buttonStyle(SubtleGlassButtonStyle())
                            .frame(maxWidth: .infinity)
                        }
                        .glassCard()
                        
                        // Goal Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Goal")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            TextField("Goal text", text: $goalText)
                                .textFieldStyle(.plain)
                                .padding()
                                .background(Color.white.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .foregroundStyle(.white)
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
                                TextField("0", text: $durationSeconds)
                                    .keyboardType(.numberPad)
                                    .multilineTextAlignment(.trailing)
                                    .textFieldStyle(.plain)
                                    .padding(.vertical, 8)
                                    .padding(.horizontal, 12)
                                    .background(Color.white.opacity(0.1))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    .foregroundStyle(.white)
                                    .frame(width: 100)
                            }
                        }
                        .glassCard()

                        // Tags Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Tags")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            TextField("Comma-separated tags", text: $tags)
                                .textFieldStyle(.plain)
                                .padding()
                                .background(Color.white.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .foregroundStyle(.white)
                        }
                        .glassCard()

                        // Notes Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Notes")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .textCase(.uppercase)
                            
                            TextField("Notes", text: $notes, axis: .vertical)
                                .textFieldStyle(.plain)
                                .padding()
                                .background(Color.white.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .foregroundStyle(.white)
                                .lineLimit(4...8)
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
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.white)
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
        try? modelContext.save()
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
