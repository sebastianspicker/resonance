# Bugs & Required Fixes

Each item can be turned into a separate issue.

---

## Known Limitations / Bugs

### 1. [Bug/Operational] Dev auth is unauthenticated and GET-driven

**Description:** When `AUTH_MODE=dev`, `/dev/login`, `/dev/authorize`, and `/dev/issue` are publicly accessible. Anyone can obtain auth codes and mint sessions; `/dev/issue` can accept an arbitrary `userId` to issue a code for any existing user. The flow is GET-driven with no CSRF or confirmation (e.g. “Login as Teacher” is one click).

**Impact:** If dev server is reachable beyond localhost (misconfig or shared env), full authentication bypass and account takeover.

**Fix:** Keep dev auth strictly local-only (document, and optionally enforce bind to loopback). Do not set `AUTH_MODE=dev` in any reachable environment. For production, implement real SSO and disable dev routes.

**Sources:** README, `docs/SECURITY.md`

---

### 2. [Bug] `redirectUri` is accepted but never validated

**Description:** `POST /auth/session` accepts `redirectUri` in the body (and iOS always sends it) but the server does not validate or bind the code to it. Docs state production design will use `redirectUri` validation.

**Impact:** When moving to real OAuth/SSO, lack of redirect binding is a standard code-interception/redirect-abuse vector. Current contract mismatch (client sends, server ignores) is misleading.

**Fix:** Implement `redirectUri` validation when introducing production auth (e.g. allowlist or exact match to registered callback). For dev, document that validation is intentionally skipped.

**Sources:** `docs/API.md`, `docs/SECURITY.md`

---

### 3. [Bug/Operational] Dev auth code in URL query (exfil surface)

**Description:** `/dev/authorize` redirects to `DEV_LOGIN_CALLBACK_URL` with `?code=...`. The auth code is in the query string; there is no validation of the redirect URL. Misconfigured or attacker-controlled callback URL can exfiltrate the code.

**Impact:** Code in URL can appear in history, logs, referrers. Open redirect + code in query is a classic token-theft path.

**Fix:** Validate `DEV_LOGIN_CALLBACK_URL` (scheme/host allowlist). Prefer passing code in fragment or via POST callback where feasible for production design.

**Sources:** `server/src/server.ts`

---

### 4. [Bug] Refresh token rotation is not atomic

**Description:** `rotateRefreshToken` reads the refresh token record, updates `revokedAt`, then issues new tokens. Steps are not in a transaction and revocation is not conditional on `revokedAt` being null. Two concurrent requests with the same refresh token can both pass validation and each get new tokens.

**Impact:** Single-use refresh token guarantee can be violated; token duplication and harder containment after theft.

**Fix:** Wrap read → conditional update (e.g. “revoke where revokedAt is null”) → issue in a transaction, or use a single atomic “claim and revoke” (e.g. conditional update by id + revokedAt).

**Sources:** `server/src/auth.ts`

---

### 5. [Bug] Entry delete: S3 delete before DB transaction (inconsistent state on failure)

**Description:** `DELETE /entries/:entryId` deletes S3 objects first, then runs a Prisma transaction for DB deletes. If the transaction fails (or S3 delete partially fails), DB can still reference deleted objects, or artifacts can remain in DB with storage already removed.

**Impact:** Irrecoverable DB/storage mismatch; broken playback or orphaned blobs; partial deletion with no clear recovery.

**Fix:** Prefer “DB transaction first” (soft-delete or mark-for-deletion, then delete storage, then hard-delete), or use a two-phase approach with clear rollback/retry. Ensure artifact list used for S3 delete is inside the same transactional view (e.g. delete in transaction, then delete storage for the same set).

**Sources:** `server/src/server.ts:351-391`

---

### 6. [Bug] Teacher course listing returns all entries (including drafts)

**Description:** `GET /courses/:courseId/entries` for a teacher returns all non-deleted entries in the course (no `status` filter). Drafts are included, unlike the dedicated review queue which filters `status: 'submitted'`.

**Impact:** Teachers can see draft practice notes and in-progress artifacts outside the intended “review queue” boundary; may violate product expectation that drafts are student-only.

**Fix:** Either restrict this endpoint for teachers to `status: 'submitted'` (or document that teachers intentionally see all entries). Align with review queue semantics.

**Sources:** `server/src/server.ts:260-274`

---

### 7. [Bug/Config] iOS dev login URL hardcoded to localhost

**Description:** `AppConfig.devLoginURL` is fixed to `http://localhost:4000/dev/login`, independent of `RESONANCE_API_BASE`. On a physical device, localhost is the device; auth breaks. API and login can target different hosts.

**Impact:** Auth fails in common on-device or multi-host dev setups; confusing and unsafe config drift.

**Fix:** Derive dev login URL from the same base as API (e.g. `apiBaseURL.appendingPathComponent("dev/login")`) or a dedicated but configurable env var.

**Sources:** `ios/ResonanceApp/Sources/AppConfig.swift`

---

### 8. [Bug/Config] Keychain not namespaced by environment

**Description:** Auth session is stored in Keychain with fixed keys. `RESONANCE_API_BASE` can point at different servers, but Keychain is shared; switching API base can reuse tokens against the wrong backend.

**Impact:** Cross-environment token reuse; confusing auth failures or tokens sent to wrong server.

**Fix:** Include environment/server identifier in Keychain keys (e.g. hash of API base or explicit “dev”/“prod” key suffix).

**Sources:** `ios/ResonanceApp/Sources/AppConfig.swift`

---

## Required Fixes / Improvements

### 9. [Enhancement] Use course role, not global role, for entry/artifact authorization

**Description:** Many routes use `user.role` from the JWT (global role) instead of `roleInCourse` from membership. `requireEntryAccess` only restricts “owner” when `user.role === 'student'`, so a user with global teacher but course student can access any entry in that course (IDOR). Presign/confirm and feedback similarly mix global vs course role.

**Fix:** Use `requireCourseRole()` result for authorization decisions (e.g. “can edit own entry” when `roleInCourse === 'student'`, “can confirm artifact” only for owning student or course teacher). Unify on course role for all course-scoped operations.

**Sources:** `server/src/server.ts`

---

### 10. [Enhancement] Enforce student ownership on artifact confirm (and align with presign)

**Description:** `POST /artifacts/:artifactId/confirm` checks only course membership; it does not enforce that a student is the owner of the artifact’s entry. Presign does enforce student ownership. Any course member can confirm any artifact.

**Fix:** Add the same ownership check as presign: if `user.role === 'student'` (or course role is student), require `artifact.entry.studentId === user.id`.

**Sources:** `server/src/server.ts:479-514`

---

### 11. [Enhancement] Validate and document `redirectUri` for production auth

Same as (2): Implement and document `redirectUri` validation when production auth is added.

---

### 12. [Enhancement] Server-side logout / refresh token revocation

**Description:** No `/auth/logout` (or similar); iOS `signOut()` only clears local state. Refresh tokens remain valid until expiry.

**Fix:** Add an endpoint that revokes the current refresh token (and optionally all refresh tokens for the user). Call it from the client on sign-out.

**Sources:** `server/src/server.ts`

---

### 13. [Enhancement] Clearer error handling and validation (entries, PATCH, notes)

**Description:** PATCH `/entries/:entryId` does not validate `goalText`/`notes` type (can 500). Submitted-entry lock checks use truthiness, so `goalText: ""` or `durationSeconds: 0` bypass the lock. Nullable fields (notes, durationSeconds) cannot be cleared via PATCH.

**Fix:** Use `requireString`/type checks for goalText and notes on PATCH; enforce submitted-entry lock with “field present in body” (e.g. `body.goalText !== undefined`) instead of truthiness; allow explicit null to clear nullable fields.

**Sources:** `server/src/server.ts`

---

### 14. [Operational] Test suite must not TRUNCATE non-test database

**Description:** Vitest setup uses existing `DATABASE_URL` if set; `resetDb()` runs `TRUNCATE ... CASCADE` on core tables. Running tests against a real DB can wipe data.

**Fix:** Force a test-only database in test setup (e.g. require `DATABASE_URL` to contain a test marker, or use a fixed test URL when not in CI). Document that `npm test` must never point at production/staging.

**Sources:** `server/tests/vitest.setup.ts`, `server/tests/testUtils.ts`

---

### 15. [Enhancement] Keychain status codes and single-flight refresh (iOS)

**Description:** Keychain set/get/delete ignore OSStatus; failures are silent. `refreshIfNeeded()` has no single-flight/lock; concurrent refresh can cause one request to invalidate the other’s token and trigger sign-out despite a successful refresh elsewhere.

**Fix:** Check Keychain status in set/delete/add and surface or retry on failure. Add a lock or single-flight for refresh so only one refresh runs at a time and callers await the same result.

**Sources:** `ios/ResonanceApp/Sources/KeychainStore.swift`, `ios/ResonanceApp/Sources/AuthManager.swift`

---

---

## Critical

### 16. [Bug] requireEntryAccess uses global role → IDOR for non-student global role

**Description:** Ownership check is `if (user.role === 'student' && entry.studentId !== user.id)`. Users with global role teacher but course role student skip the check and can access any entry in the course.

**Fix:** Use course role from `requireCourseRole()`: restrict “own entries only” when course role is student, not when global role is student. **Sources:** `02-acl.md` #1

---

### 17. [Bug] Artifact confirm has no ownership/role check

**Description:** Any course member can call `POST /artifacts/:artifactId/confirm` and mutate uploadState/remoteUrl for any artifact in the course.

**Fix:** Enforce student ownership (same as presign): student must be `artifact.entry.studentId`; teacher in course can remain allowed if product agrees. **Sources:** `server/src/server.ts`

---

### 18. [Bug] Presign allows global-teacher to get PUT URLs for others’ artifacts (overwrite risk)

**Description:** Presign only restricts students; global teacher in course can presign any artifact. Storage key is deterministic; overwrite of existing object is possible.

**Fix:** Restrict presign to owning student (and optionally teacher for a defined flow). Use course role, not global role. **Sources:** `server/src/server.ts`

---

### 19. [Bug] Feedback route uses global role; course-teacher not enforced

**Description:** POST `/feedback` and GET `/entries/:entryId/feedback` rely on global role or requireEntryAccess. A global teacher enrolled as student in a course can leave feedback; a global student with course role teacher cannot (inconsistent).

**Fix:** Use course role for “may post feedback” and “may read feedback” (e.g. require `roleInCourse === 'teacher'` for posting; visibility by entry access using course role). **Sources:** `server/src/server.ts`

---

### 20. [Bug] Entry delete: orphaned feedback and storage (non-transactional prefetch + S3 before DB)

**Description:** Artifacts are fetched outside the transaction; feedback is deleted by prefetched artifact IDs; then entry (and artifacts) are deleted. Cascade can remove artifacts not in the prefetch list, orphaning their feedback. S3 delete runs before transaction; DB failure leaves DB referencing missing storage.

**Fix:** Move artifact enumeration and feedback/artifact/entry deletion into a single transactional boundary; delete storage only after transaction commits, or use a two-phase “mark then delete storage then finalize” with retry. **Sources:** `server/src/server.ts`

---

### 21. [Bug] Presign Content-Type vs client upload (no Content-Type header)

**Description:** Server presigns with `ContentType: audio/m4a` or `video/mp4` but does not return required headers; iOS upload does not set `Content-Type`. Signature mismatch or wrong metadata can break uploads or type enforcement.

**Fix:** Either require client to send the same Content-Type on PUT (and document it), or use a presign policy that does not require Content-Type to be sent by client; align server and iOS. **Sources:** `server/src/server.ts`, `ios/ResonanceApp/Sources/SyncManager.swift`

---

### 22. [Bug] Sync queue: payload parse failure and unknown type → silent delete (data loss)

**Description:** If `payloadJSON` fails to parse as a dictionary, `process(item:)` returns without throwing; the queue item is deleted. Unknown `SyncTaskType` also falls through and item is deleted. Invalid presign URL causes upload to be skipped but item is still deleted.

**Fix:** On parse failure or unknown type, throw (or mark item failed) so the item is not deleted and can retry or be surfaced. Validate presign URL and throw if invalid before considering upload done. **Sources:** `ios/ResonanceApp/Sources/SyncManager.swift`

---

### 23. [Bug] Tests can TRUNCATE non-test database

Same as (14): Force test DB in setup; never use production/staging URL for `resetDb()`. **Sources:** `server/tests/vitest.setup.ts`, `server/tests/testUtils.ts`

---

### 24. [Bug] /auth/session does not validate redirectUri

Same as (2): Code exchange does not bind or validate `redirectUri`. **Sources:** `server/src/server.ts`

---

### 25. [Bug] ATS disabled (NSAllowsArbitraryLoads = true)

**Description:** App Transport Security is disabled globally; plain HTTP and weak TLS are allowed. Sensitive data (tokens, media) can be sent over insecure transport.

**Fix:** Enable ATS; use HTTPS for API base. If localhost HTTP is required for dev, restrict exception to localhost with a narrow plist exception. **Sources:** `ios/ResonanceApp/Sources/Resources/Info.plist`

---

### 26. [Bug] File protection / backup exclusion on new audio files ineffective

**Description:** `setFileProtection(url:)` is called on a URL before the file exists; errors are swallowed with `try?`. Newly created recordings may not get the intended protection or backup exclusion.

**Fix:** Create the file first, then set resource values and attributes; check and handle errors (or at least log). **Sources:** `ios/ResonanceApp/Sources/FileStore.swift`

---

### 27. [Bug] createEntry JSON body: Optional.none as Any breaks JSONSerialization

**Description:** iOS builds `[String: Any]` with `durationSeconds as Any` and `notes as Any`. When nil, Swift can put `Optional.none` in the dict; `JSONSerialization` cannot encode it and throws. Common for “no notes” entries.

**Fix:** Omit optional keys when nil, or use a type that encodes to JSON null explicitly (e.g. encode only when non-nil, or use a custom encoder). **Sources:** `ios/ResonanceApp/Sources/APIClient.swift`

---

### 28. [Bug] iOS date decoding (.iso8601) vs server Date (fractional seconds)

**Description:** Server returns Prisma DateTime as JSON dates (often with fractional seconds). iOS uses `JSONDecoder.dateDecodingStrategy = .iso8601`; strict ISO8601 may reject fractional seconds and cause decode failures on entries, review queue, feedback.

**Fix:** Use a custom date decoding strategy that accepts fractional seconds (e.g. ISO8601DateFormatter with `.withFractionalSeconds`), or ensure server serializes dates in a format the client accepts. **Sources:** `ios/ResonanceApp/Sources/APIClient.swift`, `server/src/server.ts`

---

### 29. [Bug] POST /feedback response omits teacherName; iOS FeedbackResponse expects it

**Description:** Server returns feedback with `teacherName` from `item.teacher.displayName`, but if the mapping or include is wrong, the field can be missing. iOS model has non-optional `teacherName` → decode crash.

**Fix:** Guarantee `teacherName` (or equivalent) in response and align type; or make iOS property optional and handle missing. **Sources:** `server/src/server.ts`, `ios/ResonanceApp/Sources/APIClient.swift`

---

### 30. [Bug] .env.example deploy-dangerous auth and placeholders

**Description:** Example env can suggest `AUTH_MODE=dev` or credential-like placeholders that are unsafe if used in production.

**Fix:** Document that dev auth must not be used in production; use safe placeholders and point to real secret management. **Sources:** `server/.env.example`

---

## High

### 31. [Bug] JWT no iss/aud/algorithms constraints

**Description:** Sign/verify use minimal options; no issuer, audience, or algorithm allowlist. **Fix:** Set and verify `iss`/`aud` where applicable; pass `algorithms` to `jwt.verify`. **Sources:** `server/src/auth.ts`

---

### 32. [Bug] Token TTL env (ACCESS_TOKEN_TTL_MINUTES, REFRESH_TOKEN_TTL_DAYS) unvalidated

**Description:** `Number(...)` can yield NaN; negative/zero accepted. **Fix:** Validate range and numeric; fail startup on invalid. **Sources:** `server/src/config.ts`

---

### 33. [Bug] /auth/refresh not gated by AUTH_MODE

**Description:** In prod, `/auth/session` returns 501 but `/auth/refresh` is still callable. **Fix:** Gate refresh by auth mode or document intentional behavior. **Sources:** `server/src/server.ts`

---

### 34. [Bug] deletedAt not enforced on artifact/feedback routes

**Description:** Artifact and feedback routes do not check `entry.deletedAt` (or artifact’s entry deleted). **Fix:** After loading entry/artifact, reject with 410 if entry is deleted. **Sources:** `server/src/server.ts`

---

### 35. [Bug] Client-controlled entry/artifact IDs with no format validation

**Description:** Client supplies primary keys; no format/length validation; duplicate ID can 500. **Fix:** Validate format (e.g. UUID or allowlist); return 409 on conflict. **Sources:** `server/src/server.ts`

---

### 36. [Bug] Submitted-entry edit lock bypass via falsy values

**Description:** Lock uses `if (body.goalText || ...)` so "" or 0 bypass. **Fix:** Check “field present” (e.g. `body.hasOwnProperty('goalText')`) instead of truthiness. **Sources:** `server/src/server.ts`

---

### 37. [Bug] Presign reuses storageKey and sets uploadState to uploading (overwrite + state regression)

**Description:** Repeated presign overwrites same key and can set already-uploaded artifact back to uploading. **Fix:** Do not overwrite storageKey if already set; do not set uploadState to uploading if already uploaded; or issue new key for each presign. **Sources:** `server/src/server.ts`

---

### 38. [Bug] ensureBucket treats any HeadBucket error as “missing” (CreateBucket race/wrong error)

**Description:** Any error from HeadBucket leads to CreateBucket; access denied or TLS errors can cause wrong behavior or multi-instance race. **Fix:** Only create on 404/NoSuchBucket; rethrow others; or use idempotent create where supported. **Sources:** `server/src/storage.ts`

---

### 39. [Bug] Sign-in callback: missing code or parse failure → silent no-op

**Description:** If callback URL or `code` is missing/unparseable, AuthManager returns without error or state update. **Fix:** Set error state or show user-visible error; do not silently no-op. **Sources:** `ios/ResonanceApp/Sources/AuthManager.swift`

---

### 40. [Bug] SwiftData fetch/save errors swallowed in SyncManager

**Description:** `try?` on fetch/save; enqueue can silently fail to persist. **Fix:** Propagate or handle errors; distinguish “empty queue” from “fetch failed”. **Sources:** `ios/ResonanceApp/Sources/SyncManager.swift`

---

### 41. [Bug] SyncManager predicate force-unwrap nextAttemptAt in #Predicate

**Description:** `item.nextAttemptAt! <= now` in predicate can be unsafe under SwiftData translation. **Fix:** Avoid force-unwrap in predicate; use optional binding or a safe expression. **Sources:** `ios/ResonanceApp/Sources/SyncManager.swift`

---

### 42. [Bug] Media directory protection only on first creation; errors swallowed

**Description:** `setFileProtection` only when directory does not exist; creation errors ignored. **Fix:** Ensure protection after create; handle and optionally retry or log errors. **Sources:** `ios/ResonanceApp/Sources/FileStore.swift`

---

### 43. [Bug] ModelContainer failure → fatalError (crash at launch)

**Description:** SwiftData container creation failure calls `fatalError`. **Fix:** Surface error to user (e.g. alert + safe state) or recover; avoid fatalError in production. **Sources:** `ios/ResonanceApp/Sources/Persistence.swift`

---

### 44. [Bug] Feedback targetId/targetType no FK (integrity only in app code)

**Description:** Feedback has no DB FK to entry/artifact; orphaned or invalid targets possible if any code path inserts without checks. **Fix:** Document and keep all insertion paths validated; optionally add DB constraints or triggers. **Sources:** `server/prisma/schema.prisma`

---

### 45. [Bug] Prisma ON DELETE CASCADE on core relations (large irreversible loss)

**Description:** Cascade deletes can remove large amounts of data in one go. **Fix:** Document and consider softer delete or narrower cascade where appropriate. **Sources:** `server/prisma/schema.prisma`, `server/prisma/migrations/`

---

### 46. [Bug] Multiple critical routes untested (submit, feedback GET, auth/me, course detail, dev/authorize)

**Description:** No tests for submit, entry feedback, auth/me, GET course by id, dev/authorize. **Fix:** Add tests for these endpoints (happy path and key negative cases). **Sources:** `server/tests/`

---

### 47. [Bug] ACL tests miss global-role vs course-role and artifact IDOR cases

**Description:** Tests do not cover teacher-in-course-as-student IDOR or artifact confirm/presign as non-owner. **Fix:** Add tests for role mismatch and artifact ownership. **Sources:** `server/tests/acl.test.ts`

---

## Quick reference: common failure causes

| Symptom | Typical cause | Fix / see |
|--------|----------------|-----------|
| 401 on API calls | Missing/invalid token, refresh race | Token in header; single-flight refresh; Keychain not failing silently |
| Unexpected sign-out | Refresh race, Keychain write failure | Single-flight refresh; check Keychain status |
| Teacher sees all entries (incl. drafts) | No status filter on GET entries | Filter by status or document intent (02-acl, 03-entries) |
| Student can confirm others’ artifacts | No ownership check on confirm | Add student-owner check (02-acl, 06-storage) |
| Entry delete leaves orphaned data / broken storage | S3 before DB; prefetch outside transaction | Delete in transaction; delete storage after commit (03, 06) |
| Upload “succeeds” but artifact not uploaded | Presign URL invalid or no Content-Type | Validate URL; set Content-Type on PUT (04, 09) |
| Sync queue item disappears, no error | Parse failure or unknown type treated as success | Throw on parse/unknown type (09, 14, 17) |
| createEntry fails on iOS (encoding) | Optional.none in JSON body | Omit nil optionals or encode explicitly (19, 17) |
| Decode failure on entries/feedback (iOS) | Date format (fractional seconds) | Align decoder with server date format (19, 10) |
| Tests wipe real DB | DATABASE_URL not forced to test DB | Use test-only DB in vitest setup (15) |
| Dev auth in production | AUTH_MODE=dev in reachable env | Never use dev auth in production; document (01, 16) |

---

## Using this list for issues

- **Labels:** `bug`, `enhancement`, `documentation`, `operational`, `security` as appropriate.
- **Title:** Use the **[Bug]** / **[Enhancement]** part as a prefix or label.
- **Body:** Copy the relevant section (description, impact, fix, sources) into the issue.
- The **quick reference** table can be linked from the README or a meta-issue for troubleshooting.
