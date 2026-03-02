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
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(entries) { entry in
                    NavigationLink(destination: EntryDetailView(entry: entry)) {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .top) {
                                Text(entry.goalText)
                                    .font(.headline.weight(.semibold))
                                    .foregroundStyle(.white)
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 16)
                                StatusBadge(status: entry.status)
                            }
                            HStack {
                                Text(entry.practiceDate, style: .date)
                                    .font(.subheadline)
                                    .foregroundStyle(.white.opacity(0.7))
                                if let duration = entry.durationSeconds {
                                    Text("• \(duration)s")
                                        .font(.subheadline)
                                        .foregroundStyle(.white.opacity(0.7))
                                }
                            }
                        }
                        .glassCard()
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
        .scrollContentBackground(.hidden)
        .overlay {
            if entries.isEmpty {
                ContentUnavailableView {
                    Label("No entries yet", systemImage: "music.note.list")
                        .foregroundStyle(.white)
                } description: {
                    Text("Create your first practice entry for this course.")
                        .foregroundStyle(.white.opacity(0.7))
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

private struct StatusBadge: View {
    let status: EntryStatus

    var body: some View {
        Text(label)
            .font(.caption.weight(.bold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color.opacity(0.2))
            .foregroundStyle(color)
            .clipShape(Capsule())
            .overlay(
                Capsule().stroke(color.opacity(0.5), lineWidth: 1)
            )
    }

    private var label: String {
        switch status {
        case .draft: return "DRAFT"
        case .submitted: return "SUBMITTED"
        case .reviewed: return "REVIEWED"
        }
    }

    private var color: Color {
        switch status {
        case .draft: return .white.opacity(0.6)
        case .submitted: return .orange
        case .reviewed: return .green
        }
    }
}
