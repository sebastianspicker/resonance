import SwiftUI
import SwiftData

struct MainSplitView: View {
    let modelContext: ModelContext
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var syncManager: SyncManager
    @EnvironmentObject var networkMonitor: NetworkMonitor
    @Query(sort: \LocalCourse.title) private var courses: [LocalCourse]
    @State private var selectionId: String?
    @State private var showCalendar = false
    @State private var showExport = false
    @State private var showSettings = false
    @State private var showQueue = false
    @State private var isRefreshing = false

    var body: some View {
        NavigationSplitView {
            List(courses, selection: $selectionId) { course in
                VStack(alignment: .leading) {
                    Text(course.title)
                    Text(course.roleInCourse.capitalized)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .tag(course.id)
            }
            .navigationTitle("Courses")
            .overlay {
                if isRefreshing { ProgressView().scaleEffect(1.2) }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 2) {
                    HStack {
                        Circle()
                            .fill(networkMonitor.isOnline ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                        Text(networkMonitor.isOnline ? "Online" : "Offline")
                        Spacer()
                        Text("Queue P:\(syncManager.pendingQueueCount) F:\(syncManager.failedQueueCount)")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    if let lastSync = syncManager.lastSyncedAt {
                        Text("Last synced \(lastSync, style: .relative) ago")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Sync") {
                        Task {
                            isRefreshing = true
                            await refreshCourses()
                            await syncManager.processQueue()
                            isRefreshing = false
                        }
                    }
                    .disabled(isRefreshing)
                }
                ToolbarItem(placement: .automatic) {
                    Button("Queue") {
                        showQueue = true
                    }
                }
                ToolbarItem(placement: .automatic) {
                    Button("Retry Failed") {
                        syncManager.retryFailedItems()
                        Task { await syncManager.processQueue() }
                    }
                    .disabled(syncManager.failedQueueCount == 0)
                }
                ToolbarItem(placement: .automatic) {
                    Button("Calendar") { showCalendar = true }
                }
                ToolbarItem(placement: .automatic) {
                    Button("Export") { showExport = true }
                }
                ToolbarItem(placement: .automatic) {
                    Button("Settings") { showSettings = true }
                }
            }
        } detail: {
            if let selectionId, let course = courses.first(where: { $0.id == selectionId }) {
                CourseDetailView(course: course)
            } else {
                ContentUnavailableView("Select a course", systemImage: "music.note.list", description: Text("Choose a course to begin."))
            }
        }
        .sheet(isPresented: $showCalendar) {
            CalendarView()
        }
        .sheet(isPresented: $showExport) {
            ExportView()
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .sheet(isPresented: $showQueue) {
            SyncQueueView()
        }
        .onOpenURL { url in
            if let courseId = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "courseId" })?.value {
                Task {
                    if courses.contains(where: { $0.id == courseId }) {
                        selectionId = courseId
                        return
                    }
                    await refreshCourses()
                    if courses.contains(where: { $0.id == courseId }) {
                        selectionId = courseId
                    }
                }
            }
        }
        .task {
            if courses.isEmpty {
                await refreshCourses()
            }
        }
    }

    private func refreshCourses() async {
        guard let session = authManager.session else { return }
        do {
            let remoteCourses = try await appState.apiClient.fetchCourses(accessToken: session.accessToken)
            let existing = (try? modelContext.fetch(FetchDescriptor<LocalCourse>())) ?? []
            let existingMap = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })

            for course in remoteCourses {
                if let local = existingMap[course.id] {
                    local.title = course.title
                    local.roleInCourse = course.roleInCourse
                } else {
                    let record = LocalCourse(id: course.id, title: course.title, roleInCourse: course.roleInCourse)
                    modelContext.insert(record)
                }
            }
            try? modelContext.save()
        } catch {
            appState.reportError(error)
        }
    }
}
