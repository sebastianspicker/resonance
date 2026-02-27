import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var apiBase = AppConfig.apiBaseURL.absoluteString

    var body: some View {
        NavigationStack {
            Form {
                Section("API") {
                    TextField("Base URL", text: $apiBase)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
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
                }
#endif

                Section("Privacy") {
                    Text("No analytics are collected by default. Media stays local until you submit.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
    }
}
