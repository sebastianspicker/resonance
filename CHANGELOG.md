# Changelog

All notable changes to this project are documented here. For detailed bug reports and required fixes, see [docs/BUGS_AND_FIXES.md](docs/BUGS_AND_FIXES.md).

## [Unreleased]

- RC demo track: added canonical Mock University fixture, demo seed/reset scripts, and local bootstrap script for reproducible screenshot states.
- iOS debug tooling: added local demo dataset loader/clear actions in Settings and bundled fixture for screenshot preparation.
- Documentation: added RC demo runbook, screenshot matrix, and release checklist.
- Repo cleanup: removed redundant `server/prisma/seed.js` (seed uses `seed.ts` only).
- iOS: fixed string interpolation in EntryDetailView error print.
- Server: atomic refresh token rotation; entry delete now runs DB transaction before S3 delete; teacher course entries restricted to `submitted` only.
- Server: test auth helper centralized in testUtils; validation and routes split into `validation.ts` and `routes/*.ts`.
- iOS: shared APIClient via AppState; SyncManager generic fetch-by-id; APIClient send/sendAny consolidated; API DTOs moved to APIModels.swift.
- iOS: central error alerts; SyncManager lastSyncedAt; loading states and "Last synced" in UI; RUNBOOK/SECURITY/API docs updated for dev auth and redirectUri.
