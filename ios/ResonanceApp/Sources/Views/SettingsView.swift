import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject var authManager: AuthManager
    @State private var demoStatusMessage: String?
    @State private var showDemoStatusAlert = false

    var body: some View {
        NavigationStack {
            Form {
                Section("API") {
                    Text("Base URL: \(AppConfig.apiBaseURL.absoluteString)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                    Text("Active host: \(AppConfig.apiBaseURL.host() ?? AppConfig.apiBaseURL.absoluteString)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button("Sign Out") {
                        authManager.signOut()
                    }
                    .foregroundStyle(.red)
                }

#if DEBUG
                Section("Debug") {
                    Text("Dev auth URL: \(AppConfig.devLoginURL.absoluteString)")
                        .font(.caption)
                        .textSelection(.enabled)

                    Button("Load Mock Demo Data") {
                        do {
                            let roleInCourse = authManager.session?.globalRole == "teacher" ? "teacher" : "student"
                            try DemoDataManager(modelContext: modelContext).loadMockUniversityData(roleInCourse: roleInCourse)
                            demoStatusMessage = "Loaded mock university demo data."
                        } catch {
                            demoStatusMessage = "Loading demo data failed: \(error.localizedDescription)"
                        }
                        showDemoStatusAlert = true
                    }

                    Button("Clear Mock Demo Data") {
                        do {
                            try DemoDataManager(modelContext: modelContext).clearMockUniversityData()
                            demoStatusMessage = "Cleared mock university demo data."
                        } catch {
                            demoStatusMessage = "Clearing demo data failed: \(error.localizedDescription)"
                        }
                        showDemoStatusAlert = true
                    }
                }
#endif

                Section("Privacy") {
                    Text("No analytics are collected by default. Media stays local until you submit.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .alert("Demo Data", isPresented: $showDemoStatusAlert) {
                Button("OK") { demoStatusMessage = nil }
            } message: {
                Text(demoStatusMessage ?? "No status available.")
            }
        }
    }
}
