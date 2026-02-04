import SwiftUI
import SwiftData

struct MainSplitView: View {
    let modelContext: ModelContext
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var syncManager: SyncManager
    @Query(sort: \LocalCourse.title) private var courses: [LocalCourse]
    @State private var selectionId: String?
    @State private var showCalendar = false
    @State private var showExport = false
    @State private var showSettings = false

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
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Sync") {
                        Task { await refreshCourses() }
                    }
                }
                ToolbarItem(placement: .automatic) {
                    Button("Upload Queue") {
                        Task { await syncManager.processQueue() }
                    }
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
        .onOpenURL { url in
            if let courseId = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "courseId" })?.value {
                selectionId = courseId
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
            let remoteCourses = try await APIClient().fetchCourses(accessToken: session.accessToken)
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
            print("Course fetch failed: \(error)")
        }
    }
}
