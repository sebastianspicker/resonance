# Status

## Progress
- Monorepo structure created with docs, server, iOS app, and infra.
- Backend API implemented with auth, courses, entries, artifacts, feedback, and presigned uploads.
- iOS SwiftUI app implemented with offline SwiftData storage, audio recording, sync queue, calendar, and export.
- Tests added for backend and iOS core logic.

## What Works
- Backend runs with Postgres + MinIO via Docker Compose.
- Dev auth flow (ASWebAuthenticationSession -> dev login -> code exchange).
- Course list, entry creation, artifact upload flow, and feedback endpoints.
- iOS app screens: login, courses, entry creation, recording, teacher queue, calendar, export, settings.

## In Progress
- UI polish and robustness of sync edge cases.
- Optional media ZIP export (stubbed and documented).
- Production SSO wiring (documented, not implemented).

## Next
- Run tests on a machine with Docker available.
- Add small UI refinements and conflict handling notes.
- Final pass on documentation and run instructions.
