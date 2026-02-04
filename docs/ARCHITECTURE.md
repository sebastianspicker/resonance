# Architecture

## Components
- iOS iPad app (SwiftUI): offline-first UI, Core Data store, background sync queue.
- API server (Fastify + Prisma): auth, course context, entries, feedback, media pre-signed URLs.
- Postgres: metadata and access control.
- Object storage (S3-compatible, MinIO in dev): media artifacts.
- ILIAS: course context via deep link (MVP), optional LTI launch documented.
- ASIMUT: iCal feed consumed directly by app.

## Optional LTI (Minimal)
- If ILIAS supports LTI launch, an LTI 1.3 launch can redirect to the same universal link with `courseId`.
- The MVP does not implement a full LTI platform; it only documents the mapping and relies on deep links.

## Data Flow
1. User signs in via ASWebAuthenticationSession -> app receives auth callback -> exchanges for tokens.
2. App syncs course/membership list into Core Data.
3. Student creates entry offline -> stored locally -> queued for sync.
4. Sync worker sends metadata to server -> requests pre-signed PUT URL -> uploads media -> confirms upload.
5. Teacher fetches queue -> posts feedback -> student sees feedback on next sync.

## Offline Strategy
- Local-first writes to Core Data with a persistent sync queue.
- Background sync using URLSession background configuration and exponential backoff.
- Last-write-wins for entry edits; feedback is append-only server-side.

## Error Handling
API returns consistent error objects:
```
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "details": { "optional": true }
  }
}
```
