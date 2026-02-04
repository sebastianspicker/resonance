import SwiftUI
import SwiftData

struct ContentView: View {
    let modelContext: ModelContext
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
    }
}
