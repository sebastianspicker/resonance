import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        ZStack {
            AppTheme.PremiumBackground()
            
            VStack(spacing: 32) {
                // Logo or Icon placeholder
                Image(systemName: "music.mic.circle.fill")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 80, height: 80)
                    .foregroundStyle(.white)
                    // optional glow
                    .shadow(color: AppTheme.accentVibrant.opacity(0.8), radius: 20)
                
                VStack(spacing: 12) {
                    Text("Resonance")
                        .font(.system(size: 42, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                    
                    Text("Practice & Feedback")
                        .font(.title3.weight(.medium))
                        .foregroundStyle(.white.opacity(0.8))
                }
                
                VStack(spacing: 16) {
                    Text("Sign in with your university account")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.7))
                    
                    Text(AppConfig.demoUniversityName)
                        .font(.headline)
                        .foregroundStyle(.white)
                    
                    Button("Sign In") {
                        authManager.signIn()
                    }
                    .buttonStyle(VibrantGlassButtonStyle())
                    .padding(.top, 8)
                    
                    Text("Environment: \(AppConfig.apiBaseURL.host() ?? AppConfig.apiBaseURL.absoluteString)")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.4))
                        .padding(.top, 16)
                }
            }
            .padding(.horizontal, 40)
            .padding(.vertical, 48)
            .glassCard(material: .ultraThinMaterial, blendMode: .luminosity)
            .padding(40) // Responsive padding from screen edge
        }
        .preferredColorScheme(.dark)
    }
}
