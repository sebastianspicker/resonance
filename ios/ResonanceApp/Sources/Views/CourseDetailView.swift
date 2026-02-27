import SwiftUI
import SwiftData

struct CourseDetailView: View {
    let course: LocalCourse
    let initialTab: Int
    @State private var selectedTab: Int = 0

    init(course: LocalCourse, initialTab: Int = 0) {
        self.course = course
        self.initialTab = initialTab
    }

    var body: some View {
        VStack {
            if course.roleInCourse == "teacher" {
                Picker("View", selection: $selectedTab) {
                    Text("Entries").tag(0)
                    Text("Review Queue").tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                if selectedTab == 0 {
                    EntryListView(courseId: course.id)
                } else {
                    TeacherQueueView(courseId: course.id)
                }
            } else {
                EntryListView(courseId: course.id)
            }
        }
        .navigationTitle(course.title)
        .onAppear {
            if course.roleInCourse == "teacher" {
                selectedTab = initialTab
            }
        }
    }
}
