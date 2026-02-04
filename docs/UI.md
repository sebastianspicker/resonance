# UI (iPad)

## Sitemap
- Login
- Courses (list)
- Course Detail
  - Entries list
  - New Entry
  - Entry Detail
  - Submit
- Teacher Review Queue
- Feedback Editor
- Calendar (ASIMUT)
- Export
- Settings

## Key Screens
- Login: ASWebAuthenticationSession; display current environment.
- Courses: split view with course list and detail.
- Entry Detail: audio player, notes, tags, upload state, feedback.
- Recording: minimal controls, elapsed timer, save/cancel.
- Teacher Queue: list of submitted entries with student and date.
- Feedback: status picker + text + optional markers.
- Calendar: day/week list with cached events.
- Export: date range picker and “Generate PDF”.

## Edge Cases
- Offline: show sync queue and “Last synced” indicator.
- Partial upload: allow retry and keep local file.
- Deleted entries: hide from lists after sync.
- Token expiration: re-auth using refresh token.
