# API (Draft)

Base URL: `http://localhost:4000`

## Auth

### POST /auth/session
Exchange authorization code for tokens.

Request:
```
{ "code": "string", "redirectUri": "string" }
```
Note: The server accepts `redirectUri` but does **not** validate it in the current (dev) auth implementation. When production auth is introduced, `redirectUri` must be validated (e.g. allowlist or exact match to the registered callback) as per OAuth best practice.

Response:
```
{ "accessToken": "jwt", "refreshToken": "jwt", "user": { "id": "...", "displayName": "...", "globalRole": "student|teacher" } }
```

### Production Auth (Design)
- University SSO (Shibboleth) is bridged to an OIDC-compatible authorization server.
- App opens the SSO authorization URL via ASWebAuthenticationSession.
- After login, the server redirects to `resonance://auth-callback?code=...`.
- App exchanges code via `POST /auth/session` using `redirectUri` validation.
- Server validates the authorization code and issues short-lived access token + rotated refresh token.

### POST /auth/refresh
Rotate refresh token.

Request:
```
{ "refreshToken": "jwt" }
```

Response:
```
{ "accessToken": "jwt", "refreshToken": "jwt" }
```

### GET /dev/login (dev only)
HTML login (ASWebAuthenticationSession) that redirects to `resonance://auth-callback`.

Note: Dev auth routes (`/dev/*`) are localhost-only and return `DEV_AUTH_LOCAL_ONLY` for non-local requests.

## Courses

### GET /courses
Returns courses for the current user.

### GET /courses/:courseId
Returns course details.

## Practice Entries

### GET /courses/:courseId/entries
Returns entries visible to the user.

### POST /courses/:courseId/entries
Create an entry.

### PATCH /entries/:entryId
Update entry fields.

### DELETE /entries/:entryId
Hard-delete entry and associated artifacts/feedback; storage objects are deleted.

### POST /entries/:entryId/submit
Submit an entry for review.

Entry lifecycle:
- `draft` -> `submitted` -> `reviewed`
- Editing/submitting is restricted to `draft` entries only.

## Artifacts

### POST /entries/:entryId/artifacts
Create artifact record.

### POST /artifacts/:artifactId/presign
Request pre-signed upload URL.

Authorization: only the owning student of the artifact's entry can call this endpoint.

Response includes required request headers for upload:
```
{
  "uploadUrl": "...",
  "storageKey": "...",
  "expiresInSeconds": 900,
  "requiredHeaders": { "Content-Type": "audio/m4a|video/mp4" }
}
```

### POST /artifacts/:artifactId/confirm
Confirm upload (server performs HEAD).

Authorization: only the owning student of the artifact's entry can call this endpoint.

## Feedback

### GET /courses/:courseId/review-queue
Teacher-only list of submitted entries.

Ordering:
- deterministic order by `practiceDate desc`, then `createdAt desc`.

### POST /feedback
Create feedback on entry or artifact.

Side effect:
- when feedback is created for an entry or one of its artifacts, the parent entry status is set to `reviewed`.

### GET /entries/:entryId/feedback
Fetch feedback for an entry.

## Errors
All errors use:
```
{ "error": { "code": "STRING_CODE", "message": "Human readable message", "details": { } } }
```
