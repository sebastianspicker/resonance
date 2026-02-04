import SwiftUI
import SwiftData

struct CourseDetailView: View {
    let course: LocalCourse
    @State private var selectedTab: Int = 0

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
    }
}
