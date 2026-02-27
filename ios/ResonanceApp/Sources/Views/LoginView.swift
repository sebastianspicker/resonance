import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        VStack(spacing: 24) {
            Text("Resonance – Practice & Feedback")
                .font(.largeTitle)
                .multilineTextAlignment(.center)

            Text("Sign in with your university account")
                .foregroundStyle(.secondary)

            Text("Environment: \(AppConfig.apiBaseURL.host() ?? AppConfig.apiBaseURL.absoluteString)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button("Sign In") {
                authManager.signIn()
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}
