import SwiftUI
import SwiftData

struct ContentView: View {
    let modelContext: ModelContext
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var syncManager: SyncManager

    var body: some View {
        Group {
            if authManager.session == nil {
                LoginView()
            } else {
                MainSplitView(modelContext: modelContext)
            }
        }
        .task {
            await syncManager.processQueue()
        }
        .alert("Error", isPresented: $appState.showErrorAlert) {
            Button("OK") { appState.clearError() }
        } message: {
            if let message = appState.lastErrorMessage {
                Text(message)
            }
        }
    }
}
