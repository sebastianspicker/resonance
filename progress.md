# Audit Progress

## Completed

### Item 1 — Dead code in `SyncManager.swift:uploadFile` ✅ FIXED
**File:** `ios/ResonanceApp/Sources/SyncManager.swift`
**Issue:** The last 3 lines of `uploadFile` were completely inert: `if data.isEmpty == false { _ = data }`. Since `data` was already captured by the `let` binding, the block did nothing. Also renamed `data` to `_` in the destructuring since the response body of a presigned PUT upload is never needed.
**Fix:** Removed the dead block; renamed `data` → `_` in `let (_, response) = ...`.

## In Progress

(none)

### Item 2 — `requireAuth` weak typing ✅ FIXED
**File:** `server/src/server.ts`, `server/src/routes/*.ts`
**Issue:** `requireAuth` was typed `(request: unknown) => Promise<void>` and immediately re-cast to a hand-rolled object type. This bypassed Fastify's type system and the `user?` augmentation declared in `types.ts`.
**Fix:** Changed signature to `(request: FastifyRequest) => Promise<void>` in `server.ts` and all 5 route files. Removed manual cast; access `request.headers.authorization` and `request.user` directly. TypeScript type-checks cleanly after.

## Queue (to be worked)

- [x] `requireAuth` in `server.ts` uses `unknown` cast, bypassing Fastify's type system — DONE
### Item 3 — `devAuthCodes` Map memory leak ✅ FIXED
**File:** `server/src/auth.ts`
**Issue:** `devAuthCodes` entries were only removed on successful `consumeDevAuthCode`. Abandoned flows (user cancels login) left expired entries in memory forever.
**Fix:** Added a lazy eviction sweep inside `issueDevAuthCode`: before inserting a new code, all entries whose `expiresAt < Date.now()` are deleted. The Map is dev-only and always tiny, so O(n) is fine.

- [x] `devAuthCodes` Map in `auth.ts` accumulates expired (unconsumed) codes indefinitely — DONE
### Item 4 — `AuthManager.refreshIfNeeded` unconditional refresh ✅ FIXED
**File:** `ios/ResonanceApp/Sources/AuthManager.swift`
**Issue:** `refreshIfNeeded()` always hit `/auth/refresh` regardless of token validity, causing a redundant network round-trip on every `processQueue()` call (which runs on every app foreground).
**Fix:** Added `isAccessTokenExpired(_:)` which base64-decodes the JWT payload and reads the `exp` claim. Returns `true` if within 60 seconds of expiry (or can't parse). `refreshIfNeeded()` now early-returns if the token is still valid.

### Item 4b — `GET /courses/:courseId/entries` teacher filter (FINDING, not fixed)
**File:** `server/src/routes/courses.ts`
**Finding:** The endpoint filters teachers to only `submitted` entries. However, the iOS client does not call this endpoint for teachers — teachers use local SwiftData (populated by create/submit sync) + `fetchReviewQueue`. Not changed; document for future web clients.

- [x] `GET /courses/:courseId/entries` for teachers only returns `submitted` entries — DOCUMENTED
- [ ] `AuthManager.refreshIfNeeded` in iOS always makes a network call even if the access token is still valid
### Item 5 — Background task expiration handler ✅ FIXED
**File:** `ios/ResonanceApp/Sources/SyncManager.swift`
**Issue:** The `UIApplication.beginBackgroundTask` expiration handler was an empty closure. Any item set to `"processing"` before iOS killed the background time would be stuck permanently — neither the success path nor the catch block runs after expiry.
**Fix:** The expiration handler now fetches all items with `status == "processing"` and resets them to `"pending"` with no `nextAttemptAt`, so they retry on the next launch.

- [x] `SyncManager.swift` background task expiration — FIXED
### Item 6 — `try? modelContext.save()` silent failures ✅ FIXED
**File:** `ios/ResonanceApp/Sources/SyncManager.swift`
**Issue:** 11 occurrences of `try? modelContext.save()` silently discarded all save errors. Failed saves can cause deleted queue items to resurface or state transitions (e.g., `uploading` → `uploaded`) to never persist.
**Fix:** Added private `saveContext()` helper that logs failures via `print`. Replaced all 11 `try? modelContext.save()` calls (including the `self.` variant in the background task closure).

- [x] `try? modelContext.save()` throughout SyncManager — FIXED
### Item 7 — `requireValidDate` regex accepts timezone-less times ✅ FIXED
**File:** `server/src/validation.ts`
**Issue:** `Z?` made timezone optional. A datetime string like `"2025-01-01T12:00:00"` passed the regex, and `new Date("2025-01-01T12:00:00")` in Node.js parses as *local server time*, causing silent timezone drift (e.g., events stored off-by-hours on a non-UTC server).
**Fix:** Changed `Z?` to `(Z|[+-]\d{2}:\d{2})` so a timezone is required when a time component is present. Date-only strings (e.g., `"2025-01-01"`) are still accepted and are correctly parsed as UTC midnight by V8.

- [x] `requireValidDate` timezone bug — FIXED

### Item 8 — `try? modelContext.save()` in Views ✅ FIXED
**Files:** `EntryDetailView.swift`, `NewEntryView.swift`, `MainSplitView.swift`, `CalendarService.swift`
**Issue:** 7 view-layer saves silently discarded errors. In critical paths (creating entry, recording artifact, submitting, deleting), this meant local state changes could fail to persist without any feedback to the user.
**Fix:**
- `EntryDetailView`: Wrapped `stopRecording`, `submitEntry`, `deleteEntry` in `do-catch` → `appState.reportError`. Moved `syncManager.enqueue` after successful save. Promoted `try?` → `try` in `refreshFeedback` (inside existing do-catch).
- `NewEntryView`: Added `@EnvironmentObject var appState`; wrapped save with `do-catch → appState.reportError`.
- `MainSplitView.refreshCourses`: Promoted `try?` → `try` inside existing `do-catch`.
- `CalendarService.refresh`: Promoted `try?` → `try` inside existing `do-catch`.

### Item 9 — `ICalParser.parseDate` wrong timezone for UTC datetimes ✅ FIXED
**File:** `ios/ResonanceApp/Sources/ICalParser.swift`
**Issue:** UTC datetime strings (ending in `Z`, e.g. `20250301T120000Z`) had the `Z` stripped then were parsed using `TimeZone.current`. On any non-UTC device, all calendar events appeared offset by the device timezone.
**Fix:** Restructured into three cases: (1) strings ending in `Z` → parse with `UTC` timezone; (2) 8-char date-only → keep `TimeZone.current` (all-day events are local); (3) floating datetime (no indicator) → keep `TimeZone.current`.

### Item 10 — `try? recorder.startRecording` in EntryDetailView ✅ FIXED
**File:** `ios/ResonanceApp/Sources/Views/EntryDetailView.swift`
**Issue:** Recording startup errors (e.g., microphone permission denied, AVAudioSession failure) were silently discarded. User would see no feedback and the button would appear to work.
**Fix:** Wrapped in `do-catch` → `appState.reportError(error)`.

### Item 11 — `artifacts.ts` confirm: empty-file validation logged as server error ✅ FIXED
**File:** `server/src/routes/artifacts.ts`
**Issue:** The `HeadObjectCommand` result check (`if (!head.ContentLength || head.ContentLength === 0) throw new Error('Empty file')`) was inside the `try` block. The outer `catch` then called `request.log.error(err)` for this deliberately-thrown error, polluting logs with spurious error-level events for what is valid client behavior (uploading an empty file → 409).
**Fix:** Extracted the S3 call into its own `let head; try { head = await s3.send(...) } catch`. Empty-file check moved outside the catch so it returns a clean 409 without logging. S3 access failures (network/auth) are still logged as errors.

### Item 12 — `FeedbackEditorView`: double-submission on "Send" ✅ FIXED
**File:** `ios/ResonanceApp/Sources/Views/FeedbackEditorView.swift`
**Issue:** The "Send" button was only disabled when `commentsText.isEmpty`. Tapping it multiple times during the async `createFeedback` call created duplicate feedback records on the server.
**Fix:** Added `@State private var isSending = false`. Set to `true` at start of `sendFeedback()` with `defer { isSending = false }`. Button `disabled` condition extended to `commentsText.isEmpty || isSending`.

### Item 13 — `ExportView`: directory creation error silently discarded ✅ FIXED
**File:** `ios/ResonanceApp/Sources/Views/ExportView.swift`
**Issue:** `try? FileManager.default.createDirectory(at:withIntermediateDirectories:)` appeared before the `do-catch` block. If the `Exports/` directory could not be created (permissions denied, disk full), the error was silently discarded. The subsequent `PDFExporter.export` call would then fail with a misleading "no such file or directory" error instead of the actual cause.
**Fix:** Moved `createDirectory` inside the existing `do-catch` block (before `PDFExporter.export`), replacing `try?` with `try`. Since `withIntermediateDirectories: true` is idempotent (no error if directory exists), this only affects real failure cases.

---

## Security Audit (Loop 2)

### SEC-1 — Vulnerable npm dependencies ✅ FIXED
**File:** `server/package.json`, `server/package-lock.json`
**Severity:** CRITICAL/HIGH (production: fastify moderate + AWS SDK fast-xml-parser chain)
**Issue:** `npm audit` reported 8 vulnerabilities (1 low, 2 moderate, 3 high, 2 critical):
- **fastify 5.7.4** (moderate) — GHSA-573f-x89g-hqp9: Missing end anchor in `subtypeNameReg` allows malformed Content-Types to bypass validation. Production exploit vector.
- **fast-xml-parser ≤5.5.5** (critical) — CVE-2026-26278 series: entity expansion DoS, stack overflow, regex injection in DOCTYPE. Via `@aws-sdk/xml-builder` in the production AWS SDK chain.
- **qs, rollup, flatted, minimatch, ajv** — DoS/path traversal in dev tools.
**Fix:**
1. Ran `npm audit fix` — updated fastify 5.7.4→5.8.2, qs, rollup, flatted, minimatch, ajv.
2. Added `"overrides": { "fast-xml-parser": "5.5.6" }` in package.json to force the patched version across the AWS SDK dependency tree. `npm install` after shows **0 vulnerabilities**.

### SEC-2 — Bearer scheme implicit-only validation ✅ FIXED
**File:** `server/src/server.ts`
**Severity:** LOW
**Issue:** `header.replace('Bearer ', '')` silently passes non-Bearer schemes (e.g., `Basic dXNlcjpwYXNz`) to `jwt.verify`. While `jwt.verify` would reject any non-JWT string with a cryptographic error, the scheme check was implicit rather than explicit — the 401 error message would say "invalid token" rather than "unsupported scheme", and the flow wasted cycles attempting JWT parsing on obviously invalid input.
**Fix:** Replaced `replace` with an explicit `startsWith('Bearer ')` guard that throws 401 immediately; token extracted with `slice(7)`.

### SEC-3 — Input Validation & Injection (CLEAN)
**Scope:** All server routes, validation helpers, database access
**Findings:** None. All code paths are clean:
- All database access uses Prisma ORM (parameterized queries; zero `$queryRaw`/`$executeRaw` found)
- All string inputs flow through `requireString()` (type-check + max 10 000 chars)
- All enum inputs flow through `requireEnum()` (strict whitelist)
- All numeric inputs flow through `requireNumber()` (type-check + optional min/max bounds)
- `requireStringArray()` caps array size at 100 elements
- No `eval`, `exec`, `child_process`, or shell invocation anywhere in `src/`
- No user-controlled URLs that the server follows (SSRF surface absent)
- No XML parsing of user input (fast-xml-parser is only in the AWS SDK chain, not exposed to user data)

### SEC-4 — S3 Presigned PUT: no upload size cap (MEDIUM, documented)
**File:** `server/src/routes/artifacts.ts`
**Severity:** MEDIUM (cost/resource risk for authenticated users)
**Issue:** `PutObjectCommand` presigned URLs don't enforce a `ContentLengthRange` condition. An authenticated student who obtains a valid presigned URL can upload files up to S3's 5 GB PUT limit, potentially creating significant unexpected storage costs.
**Note:** AWS S3 PUT presigned URLs don't support inline conditions like POST presigned forms do. Mitigation options: (1) switch to `createPresignedPost` with `ContentLengthRange`; (2) enforce S3 bucket object size limits via a bucket policy or Lambda trigger; (3) accept the risk given authenticated users in a closed app.
**Decision:** Not fixed — requires architectural decision on upload approach. Documented for future sprint.

### SEC-5 — Docker Compose unpinned `minio/minio:latest` (LOW, documented)
**File:** `infra/docker-compose.yml`
**Severity:** LOW (dev infrastructure only)
**Issue:** `minio/minio:latest` resolves to whatever is current at pull time. A breaking MinIO update or compromised image push could silently change behaviour. `postgres:16` is similarly not pinned to a patch digest, though major-pinning is standard practice.
**Note:** This is a local dev compose file, not used in production. Low blast radius. Consider pinning to a specific MinIO release tag (e.g. `minio/minio:RELEASE.2025-01-01T00-00-00Z`) to make dev environments reproducible.
**Decision:** Not fixed — dev-only tooling; low priority. Documented.

### SEC-6 — OWASP Top 10 Review (CLEAN)
**Scope:** Full server codebase
- **A01 Broken Access Control:** All routes guarded by `requireAuth` + `requireCourseRole`/`requireStudentOwner`/`requireTeacherRole`. Students cannot access other students' entries. ✅
- **A02 Cryptographic Failures:** HS256 JWT with explicit algorithm; ≥32-char secret enforced at startup; refresh tokens stored as SHA-256 hashes; `timingSafeEqual` for comparison. ✅
- **A03 Injection:** Prisma ORM throughout, no raw SQL, no shell calls. ✅
- **A04 Insecure Design:** 100 req/min global rate limit; auth codes use `nanoid(18)` (collision probability negligible); atomic refresh token rotation prevents replay. ✅
- **A05 Security Misconfiguration:** `AUTH_MODE` defaults to `prod`; dev routes require loopback IP; CORS defaults to `origin: false`; Helmet applied globally; 1 MB body limit. ✅
- **A06 Vulnerable Components:** Fixed in SEC-1. ✅
- **A07 Authentication Failures:** JWT with exp/iss/aud; refresh rotation with revocation; `timingSafeEqual`; dev auth codes have 5-min TTL. ✅
- **A08 Data Integrity Failures:** GitHub Actions pinned to SHA; Prisma migrations for schema integrity. ✅
- **A09 Logging Failures:** Pino redacts `authorization`, `refreshToken`, `accessToken`, `code`, `password`. No PII (email/phone) stored or logged. ✅
- **A10 SSRF:** No server-side outbound requests based on user-controlled input. S3 keys server-generated. ✅

---

## Code Quality Audit (Loop 3 continuation)

### Item 14 — `ISO8601DateFormatter` allocated on every date decode ✅ FIXED
**File:** `ios/ResonanceApp/Sources/APIClient.swift`
**Issue:** Two `ISO8601DateFormatter` instances were created inside the `.custom` date-decoding closure, meaning they were allocated fresh for every `Date` field in every decoded API response. `ISO8601DateFormatter` construction is expensive (locale, calendar, timezone setup).
**Fix:** Hoisted both formatters to `let` bindings captured once by the closure inside the `static let apiDecoder` initializer. They are now created exactly once for the lifetime of the app.

### Item 15 — `SettingsView` dead API URL text field ✅ FIXED
**File:** `ios/ResonanceApp/Sources/Views/SettingsView.swift`
**Issue:** `TextField("Base URL", text: $apiBase)` bound to a `@State var apiBase` that was never applied back to `AppConfig` or persisted. Users could type in the field with no effect, creating a false impression that the API URL is configurable at runtime.
**Fix:** Removed `@State var apiBase`; replaced the `TextField` with a read-only `Text` (with `.textSelection(.enabled)` for copyability). The active host line below it remains.

### Item 16 — `DemoDataManager.loadFixture` repeated `ISO8601DateFormatter` allocation ✅ FIXED
**File:** `ios/ResonanceApp/Sources/DemoDataManager.swift`
**Issue:** Same pattern as Item 14: two `ISO8601DateFormatter` instances created inside the date-decoding closure, allocated on each field parse. Consistent fix applied.
**Fix:** Hoisted both formatters to `let` bindings captured once by the closure.

### Item 17 — Full codebase sweep complete (CLEAN)
All remaining files reviewed and confirmed clean:
- **`AudioRecorder.swift`**, **`AudioPlayer.swift`** — proper `[weak self]` in Timer closures, `try?` on AVAudioSession deactivation intentional (expected to fail when other audio sources are active)
- **`AppState.swift`**, **`NetworkMonitor.swift`**, **`Persistence.swift`** — clean architecture, standard patterns
- **`KeychainStore.swift`** — delete-then-add pattern for upsert is standard; `kSecAttrAccessibleAfterFirstUnlock` is correct choice for background sync access
- **`FileStore.swift`** — correct file protection (`.complete`) + backup exclusion
- **`PDFExporter.swift`** — `sanitizeForPDF` strips control characters; page overflow handled
- **`Models.swift`** — typed enum computed properties over raw strings, cascade delete rules present
- **`APIModels.swift`**, **`AppConfig.swift`**, **`SyncQueueView.swift`** — clean
- **`CalendarView.swift`** — iCal URL is correctly persisted to `UserDefaults` (not dead UI like the Settings field)
- **`CalendarService.swift`** — clean
- **`ResonanceApp.swift`** — clean app entry point
- **`DemoDataManager.swift`** — fixed (Item 16); remainder clean
- **`AuthManager.swift`** — `authSession?.start()` discarding `Bool` return is idiomatic; all credential storage uses Keychain correctly
- **Server `errors.ts`** — detail allow-list (`field`, `reason`, `expected`, `actual`) prevents info leakage ✅
- **Server `errorCodes.ts`** — comprehensive, well-organised ✅
- **Server `index.ts`** — clean startup with proper error exit code ✅
- **Server `storage.ts`** — `ensureBucket` swallows `HeadBucket` error type (LOW, dev-only path, not fixed)
- **Server tests** — real-database integration tests; ACL, upload flow, auth, CORS, dev-auth-local all covered ✅
- **iOS tests** — tags round-trip, sync queue enqueue, iCal parse ✅

### Item 18 — `SyncManager` `SyncError` cases not caught as non-retryable ✅ FIXED
**File:** `ios/ResonanceApp/Sources/SyncManager.swift`
**Issue:** `processQueue` had two "mark as failed" branches: one for `APIError` with `VALIDATION_ERROR`, and one for `NSError(domain: "SyncLocal", code: 404)` (thrown by the `fetchFirst` helper). However, the `postFeedback` case throws `SyncError.localFeedbackNotFound` directly — a Swift enum error, not `NSError`. Swift enum errors bridge to NSError with a module-scoped domain (not `"SyncLocal"`), so this case fell through to the `else` branch: `item.status = "pending"` with exponential backoff. A missing local feedback record will never appear on retry, so the item was silently retried forever.
**Fix:** Added `else if error is SyncError { item.status = "failed" }` — all typed `SyncError` cases (bad payload, unknown task type, missing local file, invalid presign URL, missing local data) are non-retryable by definition and now correctly mark the item as failed.

### Item 19 — `ICalParser.parseDate` creates `DateFormatter` on every call ✅ FIXED
**File:** `ios/ResonanceApp/Sources/ICalParser.swift`
**Issue:** A new `DateFormatter` was constructed inside `parseDate` on every invocation. `DateFormatter` is one of the most expensive objects in Foundation (locale, calendar, collation setup). Called twice per calendar event (DTSTART + DTEND), a 100-event calendar allocates 200 formatters unnecessarily.
**Fix:** Extracted three static `DateFormatter` constants (UTC datetime, all-day, floating datetime) captured once at first use; `parseDate` now just calls `.date(from:)` on the appropriate pre-built instance.

## Remaining (to audit)

---

## GitHub / CI Audit (Loop 4)

### CI-1 — Missing `LICENSE` file ✅ FIXED
**File:** `LICENSE` (created)
**Issue:** `README.md` states "MIT" under the License section but no `LICENSE` file existed in the repository. GitHub does not surface a license badge without this file; tools like Dependabot and SBOM generators use the file.
**Fix:** Created `LICENSE` with standard MIT text, copyright 2026.

### CI-2 — CI database name missing "test" — safety check would reject it ✅ FIXED
**File:** `.github/workflows/ci.yml`
**Issue:** The `server` job set `DATABASE_URL` to `postgresql://…/resonance` and created a Postgres service with `POSTGRES_DB: resonance`. However, `vitest.setup.ts` calls `process.exit(1)` if `DATABASE_URL` doesn't contain "test". The `??` fallback in `vitest.setup.ts` (`??= resonance_test`) is bypassed when `DATABASE_URL` is already set by CI — so all CI test runs would immediately exit before any test ran.
**Fix:** Changed `POSTGRES_DB` to `resonance_test` and `DATABASE_URL` database segment to `resonance_test`.

### CI-3 — `format:check` not enforced in CI ✅ FIXED
**Files:** `.github/workflows/ci.yml`, `CONTRIBUTING.md`
**Issue:** `npm run format:check` existed in `package.json` but wasn't in the CI workflow. Formatting violations could silently merge. CONTRIBUTING.md also omitted `npm run format` from the developer pre-PR loop.
**Fix:** Added `Format check` step to `ci.yml` after Lint; added `npm run format` to the CONTRIBUTING.md fast loop (auto-fix mode for local use; CI uses check mode).

### CI-4 — Existing GitHub infrastructure (CLEAN / COMPLETE)
The following were verified as already in good shape:
- `CODEOWNERS` — covers CI, auth, infra, security docs, prisma
- `dependabot.yml` — npm + GitHub Actions, weekly, with grouped minor/patch updates
- `.github/workflows/codeql.yml` — JavaScript/TypeScript, pinned SHAs, scheduled + push/PR
- `.github/workflows/security-audit.yml` — weekly npm audit, prod-only, pinned SHAs
- `.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml` — minimal, YAML format, practical
- `.github/pull_request_template.md` — clean checklist
- All GitHub Actions use pinned SHAs with version comments
- `.gitignore` — comprehensive, covers Node/TS, Xcode/SwiftPM, Prisma, secrets, coverage
- `server/.env.example` — uses placeholder values; `AUTH_MODE=dev` documented as dev-only
- No hardcoded secrets found in source files
- Default branch is `main`; 10 tracked PNGs are intentional RC screenshots

---

## Docs Audit (Loop 3)

### Doc-1 — `ARCHITECTURE.md` "Core Data" → "SwiftData" ✅ FIXED
**File:** `docs/ARCHITECTURE.md`
**Issue:** Three occurrences of "Core Data" — in the components list, data flow step 2, and offline strategy. The iOS app uses SwiftData (`@Model`, `ModelContext`, `SwiftData` framework), not the legacy CoreData framework directly.
**Fix:** Replaced all three instances with "SwiftData".

### Doc-2 — README, CONTRIBUTING, CHANGELOG, INDEX (CLEAN)
All four files are clean: direct tone, no AI slop phrases, technically accurate, no bold mid-sentence for emphasis. No changes needed.

### Doc-3 — `API.md` bold mid-sentence emphasis ✅ FIXED
**File:** `docs/API.md`
**Issue:** `does **not** validate it` — bold used mid-sentence for emphasis, not as a heading or definition term.
**Fix:** Removed bold; lightly reworded for clarity.

### Doc-4 — Security, Runbook, UI, Release, PR template (CLEAN)
`docs/SECURITY.md`, `SECURITY.md`, `docs/RUNBOOK.md`, `docs/UI.md`, `docs/PRD.md`, `docs/RELEASE_CANDIDATE_DEMO.md`, `docs/RELEASE_CANDIDATE_SCREENSHOTS.md`, `docs/RELEASE_CHECKLIST.md`, `.github/pull_request_template.md` — all clean. Bold uses are definition-term labels only (e.g. `**Dev auth:**`). No AI slop, no filler.

### Doc-5 — `BUGS_AND_FIXES.md` mid-sentence bold ✅ FIXED
**File:** `docs/BUGS_AND_FIXES.md`
**Issue:** "Use the **[Bug]** / **[Enhancement]** part as a prefix" — bold used mid-sentence for emphasis on bracket labels.
**Fix:** Removed bold from bracket labels; reworded to "Use the [Bug] / [Enhancement] bracket prefix from the section header."

### Doc-6 — `archive/plans/improvement-plan.md` "comprehensive" ✅ FIXED
**File:** `docs/archive/plans/improvement-plan.md`
**Issue:** "This comprehensive plan covers..." — filler adjective with no information content.
**Fix:** Removed "comprehensive"; changed em-dash style from hyphen to proper em-dash.

### Doc-7 — `server/src/auth.ts` redundant comment ✅ FIXED
**File:** `server/src/auth.ts`
**Issue:** `// JWT configuration constants` above three constants already named `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ALGORITHM` — purely restates what the names already say.
**Fix:** Removed the comment.

### Doc-8 — `SyncManager.swift` inline comment quality ✅ FIXED
**File:** `ios/ResonanceApp/Sources/SyncManager.swift`
**Issue:** Two comments needed improvement: (1) "Critical check: Does the file actually exist?" — question-form debug comment that doesn't explain the WHY; (2) "Validate presign URL before upload" — purely restates the guard clause.
**Fix:** (1) Replaced with "Fail fast before requesting a presign URL: missing file can't be recovered by retry." (2) Removed the redundant validate comment.

### Doc-9 — Archive and remaining docs (CLEAN)
All other archive docs (`ASSUMPTIONS.md`, `DATA_MODEL.md`, `archive/README.md`, `SPECIFICATION.md`, `USER_STORIES.md`, `execution-baseline.md`) contain no AI slop vocabulary. No bold mid-sentence. No changes needed.
Inline code comments across all Swift and TypeScript source files reviewed — comments explain WHY, not WHAT. Section labels in SwiftUI view bodies are acceptable navigation markers. All TODO/FIXME scans returned empty.

### Doc-10 — `server/src/services/entryCascade.ts` discovered (CLEAN)
New service file not yet in earlier audit scope. Docstrings on all three exported/local functions are clear WHY-focused documentation. No changes needed.

---

## Final Review (Loop 5 — Opus)

### Final-1 — `requireAuth` bearer check: dead branch + misleading message ✅ FIXED
**File:** `server/src/server.ts`
**Issue:** Sonnet's SEC-2 fix split the auth check into two branches that threw the same error code and message. Sending `Basic xyz` would trigger "Missing Authorization header" — factually wrong (the header exists). Two branches producing identical output is dead branching.
**Fix:** Collapsed into a single `if (!header || !header.startsWith('Bearer '))` with message "Missing or invalid Authorization header".

### Final-2 — `uploadFile` redundant URL parsing ✅ FIXED
**File:** `ios/ResonanceApp/Sources/SyncManager.swift`
**Issue:** The presign URL was parsed to a `URL` at the call site (creating an unused `url` binding), then the string was passed to `uploadFile`, which parsed it again. Unused binding, double work.
**Fix:** Changed `uploadFile` to accept `url: URL` instead of `urlString: String`. Removed the internal re-parse. The call site now passes the already-parsed URL.

### Final-3 — README blockquote contradicts repo contents ✅ FIXED
**File:** `README.md`

### Final-4 — Full review of all 4 audit loops (VERIFIED)
Reviewed every modified file in the diff (28 files, +394/-260 lines). Verified:
- **Correct:** ICalParser timezone fix, static formatters, AuthManager JWT decode, SyncError catch ordering, SyncManager saveContext pattern, view-layer error handling, CI database name fix, format:check addition, validation regex timezone fix, artifact confirm error logging, FeedbackEditor double-submit guard, ExportView directory creation, LICENSE creation.
- **Consistent:** Error messages follow same tone and format across all routes. No AI-generated writing in docs. CI tests what README claims.
- **Architectural:** Server module structure is clean (server.ts → routes/ → validation/auth/errors). No circular imports, no unnecessary abstractions. iOS SyncManager is the right amount of complexity for its job.
- **Edge cases:** JWT decode fails safe (returns true = refresh). Background task expiration resets stuck items. `fetchFirst` → NSError and `SyncError` enum both caught correctly.
- **Would-not-ship items:** Three issues from Sonnet's work fixed above (Final-1, Final-2, Final-3). No other issues found.
**File:** `README.md`
**Issue:** "You need to provide your own Backend/Connector" at the top of the README directly contradicts the working Fastify server in `server/`. The actual gap is production SSO — the dev auth works end-to-end.
**Fix:** Rewrote the note to say what's actually missing: "Production auth (university SSO via Shibboleth/OIDC) is documented but not wired up."

### Doc-11 — `BUGS_AND_FIXES.md` stale status on items 5 and 20 ✅ FIXED
**File:** `docs/BUGS_AND_FIXES.md`
**Issue:** Items 5 and 20 described the "S3 before DB" entry-delete bug as open. The CHANGELOG noted it was fixed, and inspection of `server/src/services/entryCascade.ts` confirmed the fix. Source references in both items pointed at the old `server/src/server.ts` rather than the new service file.
**Fix:**
- Item 5: marked as fixed; updated description to explain the `cascadeDeleteEntry` + `cleanupS3Objects` pattern; updated source reference.
- Item 20: marked as partially fixed; noted S3 ordering is resolved; clarified that artifact prefetch outside `$transaction` remains; updated source reference.
