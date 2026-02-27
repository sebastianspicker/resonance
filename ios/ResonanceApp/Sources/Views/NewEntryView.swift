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
            Form {
                Section("Template") {
                    Picker("Preset", selection: $selectedTemplateId) {
                        ForEach(EntryTemplate.defaults) { template in
                            Text(template.name).tag(template.id)
                        }
                    }
                    Button("Apply Template") {
                        applySelectedTemplate()
                    }
                }

                Section("Goal") {
                    TextField("Goal text", text: $goalText)
                }
                Section("Practice") {
                    DatePicker("Date", selection: $practiceDate, displayedComponents: [.date, .hourAndMinute])
                    TextField("Duration (seconds)", text: $durationSeconds)
                        .keyboardType(.numberPad)
                }
                Section("Tags") {
                    TextField("Comma-separated tags", text: $tags)
                }
                Section("Notes") {
                    TextField("Notes", text: $notes, axis: .vertical)
                }
            }
            .navigationTitle("New Entry")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveEntry() }
                        .disabled(goalText.isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
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
