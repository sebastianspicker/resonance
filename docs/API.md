# API (Draft)

Base URL: `http://localhost:4000`

## Auth

### POST /auth/session
Exchange authorization code for tokens.

Request:
```
{ "code": "string", "redirectUri": "string" }
```

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

### POST /dev/login (dev only)
HTML login (ASWebAuthenticationSession) that redirects to `resonance://auth-callback`.

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

## Artifacts

### POST /entries/:entryId/artifacts
Create artifact record.

### POST /artifacts/:artifactId/presign
Request pre-signed upload URL.

### POST /artifacts/:artifactId/confirm
Confirm upload (server performs HEAD).

## Feedback

### GET /courses/:courseId/review-queue
Teacher-only list of submitted entries.

### POST /feedback
Create feedback on entry or artifact.

### GET /entries/:entryId/feedback
Fetch feedback for an entry.

## Errors
All errors use:
```
{ "error": { "code": "STRING_CODE", "message": "Human readable message", "details": { } } }
```
