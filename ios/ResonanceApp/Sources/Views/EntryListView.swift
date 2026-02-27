import SwiftUI
import SwiftData

struct EntryListView: View {
    let courseId: String
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var syncManager: SyncManager
    @Environment(\.modelContext) private var modelContext
    @Query private var entries: [LocalPracticeEntry]
    @State private var showNewEntry = false

    init(courseId: String) {
        self.courseId = courseId
        _entries = Query(filter: #Predicate { $0.courseId == courseId && $0.deletedAt == nil }, sort: \LocalPracticeEntry.practiceDate, order: .reverse)
    }

    var body: some View {
        List {
            ForEach(entries) { entry in
                NavigationLink(destination: EntryDetailView(entry: entry)) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(entry.goalText)
                                .font(.headline)
                            Spacer()
                            StatusBadge(status: entry.status)
                        }
                        HStack {
                            Text(entry.practiceDate, style: .date)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if let duration = entry.durationSeconds {
                                Text("• \(duration)s")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .overlay {
            if entries.isEmpty {
                ContentUnavailableView(
                    "No entries yet",
                    systemImage: "music.note.list",
                    description: Text("Create your first practice entry for this course.")
                )
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New Entry") { showNewEntry = true }
            }
        }
        .sheet(isPresented: $showNewEntry) {
            NewEntryView(courseId: courseId)
        }
    }
}

private struct StatusBadge: View {
    let status: EntryStatus

    var body: some View {
        Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.18))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private var label: String {
        switch status {
        case .draft: return "Draft"
        case .submitted: return "Submitted"
        case .reviewed: return "Reviewed"
        }
    }

    private var color: Color {
        switch status {
        case .draft: return .secondary
        case .submitted: return .orange
        case .reviewed: return .green
        }
    }
}
