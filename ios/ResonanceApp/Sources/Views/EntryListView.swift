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
                    VStack(alignment: .leading) {
                        Text(entry.goalText)
                            .font(.headline)
                        Text(entry.practiceDate, style: .date)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
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
