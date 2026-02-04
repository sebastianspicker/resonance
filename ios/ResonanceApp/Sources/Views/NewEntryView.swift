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

    var body: some View {
        NavigationStack {
            Form {
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
}
