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
    private let apiClient: APIClient
    private var refreshTask: Task<Void, Error>?

    init(apiClient: APIClient = APIClient()) {
        self.apiClient = apiClient
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

    func signInForScreenshot(role: ScreenshotPersona) async throws {
        let userId: String
        switch role {
        case .student:
            userId = AppConfig.screenshotStudentUserId
        case .teacher:
            userId = AppConfig.screenshotTeacherUserId
        }
        let code = try await apiClient.issueDevCode(role: role.rawValue, userId: userId)
        let session = try await apiClient.exchangeCodeForTokens(code: code)
        persistSession(session)
    }

    func signOut() {
        // Attempt server-side logout (revoke refresh tokens)
        Task {
            if let session = session {
                do {
                    try await apiClient.logout(accessToken: session.accessToken)
                } catch {
                    // Log but don't fail - local signout should still proceed
                    print("Server logout failed: \(error)")
                }
            }
        }
        
        // Clear local credentials
        KeychainStore.remove("accessToken")
        KeychainStore.remove("refreshToken")
        KeychainStore.remove("userId")
        KeychainStore.remove("displayName")
        KeychainStore.remove("globalRole")
        session = nil
    }

    func refreshIfNeeded() async {
        guard let session else { return }

        // If a refresh is already in progress, await it.
        if let existingTask = refreshTask {
            _ = try? await existingTask.value
            return
        }

        // Only refresh if the access token is expired or within 60 seconds of expiry.
        guard isAccessTokenExpired(session.accessToken) else { return }

        let task = Task {
            let refreshed = try await apiClient.refreshTokens(refreshToken: session.refreshToken)
            let newSession = AuthSession(
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                userId: session.userId,
                displayName: session.displayName,
                globalRole: session.globalRole
            )
            persistSession(newSession)
        }
        
        refreshTask = task
        
        do {
            try await task.value
            refreshTask = nil
        } catch {
            refreshTask = nil
            print("Refresh failed: \(error)")
            signOut()
        }
    }

    /// Returns true if the JWT access token is expired or will expire within 60 seconds.
    private func isAccessTokenExpired(_ token: String) -> Bool {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count >= 2 else { return true }
        var base64 = parts[1]
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder != 0 { base64 += String(repeating: "=", count: 4 - remainder) }
        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else {
            return true
        }
        return Date(timeIntervalSince1970: exp).timeIntervalSinceNow < 60
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
