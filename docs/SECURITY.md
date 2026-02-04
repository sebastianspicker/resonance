# Security & GDPR

## Threat Model (MVP)

### Assets
- Student audio recordings and feedback.
- User identity and course membership.
- Access/refresh tokens.

### Trust Boundaries
- iOS client <-> API server (TLS)
- API server <-> Postgres
- API server <-> S3-compatible storage
- External: ILIAS deep links, ASIMUT iCal feeds

### Threats & Mitigations
- IDOR on course/entry IDs: server enforces membership checks on every request.
- Token theft: short-lived access tokens, refresh rotation, token hashes stored server-side, no tokens in logs.
- Media exposure: pre-signed URLs limited to short TTL; object keys are unguessable UUIDs; server verifies upload by HEAD.
- Offline device loss: iOS File Protection (`NSFileProtectionComplete`) for local media; OS-level device encryption.
- CSRF/redirect abuse in SSO: ASWebAuthenticationSession with strict callback URL scheme; server does not currently validate `redirectUri` in dev auth flow.

## GDPR Controls
- Data minimization: store only `id`, `displayName`, and role. No analytics by default.
- Deletion: entries can be deleted; server deletes metadata and storage object.
- Retention: suggested retention is 12 months after course end (configurable).
- Logging: no media content; PII minimized and token values are redacted.
- Consent: explicit in-app explanation for recordings and uploads.

## Secure Defaults
- TLS enforced in production.
- Postgres and S3 encrypted at rest (documented for ops).
- Environment variables for secrets; no secrets in repo.
