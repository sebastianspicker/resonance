# Security Policy

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Send a private report with details and reproduction steps to:
- security@resonance.example (replace with your real contact)

We will acknowledge receipt within 7 days and provide a remediation timeline.

## Supported Versions

This is an MVP prototype. Only the `main` branch is supported.

## Security Controls (Current)

- Token-based auth with refresh rotation
- Dev auth routes are disabled unless `AUTH_MODE=dev`
- Secret scanning: `./scripts/secret-scan.sh`
- Dependency audit in CI: `npm audit --audit-level=high`
- SAST in CI: CodeQL (`.github/workflows/codeql.yml`)

## Scope Notes

- Production auth is not implemented yet.
- Environment variables are required for secrets and must not be committed.
