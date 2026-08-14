import Foundation
import SwiftData

// Resolves app-wide defaults and screenshot-safe services without weakening AppState injection seams.
@MainActor
struct AppStateDependencies {
    let apiClient: APIClient
    let authManager: AuthManager
    let syncManager: SyncManager
    let networkMonitor: NetworkMonitor
    let localProfileDependencies: AppStateLocalProfileDependencies

    init(
        modelContext: ModelContext,
        fetchArtifacts: (() throws -> [LocalArtifact])?,
        saveChanges: (() throws -> Void)?,
        removeStoredMediaFiles: (() throws -> Void)?,
        hasStoredMediaFiles: (() throws -> Bool)?,
        removeCalendarSubscription: (() throws -> Void)?,
        localDataOwner: (() throws -> String?)?,
        setLocalDataOwner: ((String) throws -> Void)?,
        removeLocalDataOwner: (() throws -> Void)?,
        clearLocalCredentials: (() throws -> AuthSession?)?,
        revokeRemoteSession: ((AuthSession?) -> Void)?,
        apiClient: APIClient?,
        networkMonitor: NetworkMonitor?
    ) {
        let fetchArtifacts = fetchArtifacts ?? {
            try modelContext.fetch(FetchDescriptor<LocalArtifact>())
        }
        let saveChanges = saveChanges ?? {
            try modelContext.save()
        }
        let removeStoredMediaFiles = removeStoredMediaFiles ?? {
            try FileStore.removeAllStoredMediaFiles()
        }
        let hasStoredMediaFiles = hasStoredMediaFiles ?? {
            try FileStore.hasStoredMediaFiles()
        }
        let removeCalendarSubscription = removeCalendarSubscription ?? {
            try CalendarSubscriptionStore.removeStoredURL()
        }
        let client = apiClient ?? APIClient()
        self.apiClient = client
        let screenshotScenario = Self.screenshotScenario
        let ownerStore = Self.localDataOwnerStore(
            scenario: screenshotScenario,
            read: localDataOwner,
            write: setLocalDataOwner,
            remove: removeLocalDataOwner
        )
        let auth = Self.makeAuthManager(client: client, screenshotScenario: screenshotScenario)
        self.authManager = auth
        let clearLocalCredentials = clearLocalCredentials ?? {
            try auth.clearLocalSessionReturningPreviousSession()
        }
        let revokeRemoteSession = revokeRemoteSession ?? { auth.revokeRemoteSession($0) }
        let localProfileDependencies = AppStateLocalProfileDependencies(
            modelContext: modelContext,
            fetchArtifacts: fetchArtifacts,
            saveChanges: saveChanges,
            removeStoredMediaFiles: removeStoredMediaFiles,
            hasStoredMediaFiles: hasStoredMediaFiles,
            removeCalendarSubscription: removeCalendarSubscription,
            localDataOwner: ownerStore.read,
            setLocalDataOwner: ownerStore.write,
            removeLocalDataOwner: ownerStore.remove,
            clearLocalCredentials: clearLocalCredentials,
            revokeRemoteSession: revokeRemoteSession
        )
        self.localProfileDependencies = localProfileDependencies
        let network = networkMonitor ?? NetworkMonitor()
        self.networkMonitor = network
        self.syncManager = SyncManager(
            modelContext: localProfileDependencies.modelContext,
            authManager: auth,
            apiClient: client,
            networkMonitor: network,
            verifiedOwner: localProfileDependencies.localDataOwner
        )
    }

    private static var screenshotScenario: ScreenshotScenario? {
#if RESONANCE_SCREENSHOTS
        ScreenshotScenario.current
#else
        nil
#endif
    }

    private static func localDataOwnerStore(
        scenario: ScreenshotScenario?,
        read: (() throws -> String?)?,
        write: ((String) throws -> Void)?,
        remove: (() throws -> Void)?
    ) -> LocalDataOwnerStore {
        guard let scenario else {
            let defaults = KeychainStore.localDataOwnerStore()
            return LocalDataOwnerStore(
                read: read ?? defaults.read,
                write: write ?? defaults.write,
                remove: remove ?? defaults.remove
            )
        }
        let userId = scenario.persona == .teacher ? AppConfig.screenshotTeacherUserId : AppConfig.screenshotStudentUserId
        return LocalDataOwnerStore(read: read ?? { userId }, write: write ?? { _ in }, remove: remove ?? {})
    }

    private static func makeAuthManager(client: APIClient, screenshotScenario: ScreenshotScenario?) -> AuthManager {
        guard screenshotScenario != nil else { return AuthManager(apiClient: client) }
        return AuthManager(
            apiClient: client,
            storeSessionData: { _ in },
            readSessionData: { nil },
            removeSessionData: {},
            setSessionPersistenceUncertain: { _ in },
            isSessionPersistenceUncertain: { false }
        )
    }

    func makeLocalProfileLifecycle(syncManager: SyncManager) -> AppStateLocalProfileLifecycle {
        localProfileDependencies.makeLifecycle(
            invalidateProcessing: { syncManager.invalidateProcessing() },
            cancelAndWaitForProcessing: { await syncManager.cancelAndWaitForProcessing() }
        )
    }
}
