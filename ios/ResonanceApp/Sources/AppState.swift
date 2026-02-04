import Foundation
import SwiftData

@MainActor
final class AppState: ObservableObject {
    let authManager: AuthManager
    let syncManager: SyncManager

    init(modelContext: ModelContext) {
        let auth = AuthManager()
        self.authManager = auth
        self.syncManager = SyncManager(modelContext: modelContext, authManager: auth)
    }
}
