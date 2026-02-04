# REPO_MAP

## Top-Level Layout
- `server/`: Node.js + TypeScript API server (Fastify + Prisma).
- `ios/ResonanceApp/`: SwiftUI iPad app as a Swift Package.
- `infra/`: Docker Compose for local Postgres and MinIO.
- `docs/`: Product, architecture, and security documentation.

## Backend (server/)
Entry points:
- `server/src/index.ts`: bootstraps Prisma + S3 client, ensures bucket, starts Fastify.
- `server/src/server.ts`: HTTP routes, auth guard, and core API behavior.

Core modules:
- `server/src/auth.ts`: JWT issuance/verification, refresh rotation, dev auth flow.
- `server/src/config.ts`: env parsing and defaults.
- `server/src/storage.ts`: S3 client setup and bucket creation.
- `server/src/errors.ts`: API error shape and handler.
- `server/prisma/schema.prisma`: DB schema (users, courses, entries, artifacts, feedback, refresh tokens).

Tests:
- `server/tests/*.test.ts`: auth, ACL, and upload flows.

Hotspots / risk areas:
- Auth and token rotation: `server/src/auth.ts`.
- Access control and data access: `server/src/server.ts`.
- Storage confirmation & presign flow: `server/src/server.ts`, `server/src/storage.ts`.

## iOS App (ios/ResonanceApp/)
Entry point:
- `ios/ResonanceApp/Sources/ResonanceApp.swift`.

Core modules (by file):
- `Sources/AppState.swift`: app-level state.
- `Sources/AuthManager.swift`: auth flow and token storage.
- `Sources/SyncManager.swift`: offline sync queue.
- `Sources/APIClient.swift`: API calls.
- `Sources/Persistence.swift`: local Core Data.
- `Sources/AudioRecorder.swift`, `Sources/AudioPlayer.swift`: capture/playback.
- `Sources/FileStore.swift`, `Sources/PDFExporter.swift`: local files and exports.

Tests:
- `ios/ResonanceApp/Tests/ResonanceAppTests.swift`.

## Infrastructure
- `infra/docker-compose.yml`: Postgres 16 + MinIO for local development.

## Data Flows (High-Level)
- Auth: iOS app obtains dev auth code -> `POST /auth/session` -> access/refresh tokens.
- Practice entry: app posts entry -> presigns upload -> uploads to S3/MinIO -> confirms upload.
- Feedback: teacher reads review queue -> posts feedback -> student fetches feedback.

## External Integrations (from docs)
- ILIAS deep link (optional LTI mapping documented).
- ASIMUT iCal feed (app-side consumption).
