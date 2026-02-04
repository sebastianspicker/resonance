import Foundation
import AuthenticationServices
import SwiftUI
import UIKit

struct AuthSession: Codable {
    var accessToken: String
    var refreshToken: String
    var userId: String
    var displayName: String
    var globalRole: String
}

@MainActor
final class AuthManager: NSObject, ObservableObject {
    @Published var session: AuthSession?
    private var authSession: ASWebAuthenticationSession?
    private let apiClient = APIClient()

    override init() {
        super.init()
        loadSession()
    }

    func loadSession() {
        guard let access = KeychainStore.get("accessToken"),
              let refresh = KeychainStore.get("refreshToken"),
              let userId = KeychainStore.get("userId"),
              let displayName = KeychainStore.get("displayName"),
              let role = KeychainStore.get("globalRole") else {
            session = nil
            return
        }
        session = AuthSession(accessToken: access, refreshToken: refresh, userId: userId, displayName: displayName, globalRole: role)
    }

    func signIn() {
        let callbackScheme = AppConfig.authCallbackScheme
        let authURL = AppConfig.devLoginURL

        authSession = ASWebAuthenticationSession(url: authURL, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
            guard let self else { return }
            if let error {
                print("Auth error: \(error)")
                return
            }
            guard let callbackURL else { return }
            guard let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else {
                return
            }
            Task {
                do {
                    let session = try await self.apiClient.exchangeCodeForTokens(code: code)
                    self.persistSession(session)
                } catch {
                    print("Auth exchange failed: \(error)")
                }
            }
        }
        authSession?.presentationContextProvider = self
        authSession?.prefersEphemeralWebBrowserSession = true
        _ = authSession?.start()
    }

    func signOut() {
        KeychainStore.remove("accessToken")
        KeychainStore.remove("refreshToken")
        KeychainStore.remove("userId")
        KeychainStore.remove("displayName")
        KeychainStore.remove("globalRole")
        session = nil
    }

    func refreshIfNeeded() async {
        guard let session else { return }
        do {
            let refreshed = try await apiClient.refreshTokens(refreshToken: session.refreshToken)
            let newSession = AuthSession(
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                userId: session.userId,
                displayName: session.displayName,
                globalRole: session.globalRole
            )
            persistSession(newSession)
        } catch {
            print("Refresh failed: \(error)")
            signOut()
        }
    }

    private func persistSession(_ session: AuthSession) {
        KeychainStore.set(session.accessToken, for: "accessToken")
        KeychainStore.set(session.refreshToken, for: "refreshToken")
        KeychainStore.set(session.userId, for: "userId")
        KeychainStore.set(session.displayName, for: "displayName")
        KeychainStore.set(session.globalRole, for: "globalRole")
        self.session = session
    }
}

extension AuthManager: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
