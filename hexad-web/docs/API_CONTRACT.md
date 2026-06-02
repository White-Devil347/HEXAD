# HEXAD Backend API Contract (Production)

This document defines the production API contract for the Hexad system based on the system architecture (multi-college + RBAC + session lifecycle + strict validation).

## Base URL

- Local: `http://localhost:5000/api`
- Deployed (Render example): `https://hexad-api.onrender.com/api`

Health check:
- `GET /health` (public)

## Core Concepts

### Multi-college (tenant) model

- Every request that reads/writes tenant data is scoped by `collegeId`.
- `collegeId` is derived from the authenticated user profile (`req.user.collegeId`) and is **not accepted from the client** for protected operations.
- Firebase RTDB data is organized under:
  - `colleges/{collegeId}/...`

### Roles (RBAC)

- Authentication: Firebase ID token (`Authorization: Bearer <token>`)
- Authorization:
  - Teacher endpoints require role in `{ super_admin, admin, teacher }`
  - Student endpoints require role `student`

### Session lifecycle

Session `status` values:
- `scheduled` → created but not started
- `active` → accepting attendance submissions
- `completed` → ended (terminal)
- `cancelled` → cancelled (terminal)

Note: legacy RTDB data may contain `ended`; backend normalizes it to `completed`.

## Data Models

### Attendance Session (`colleges/{collegeId}/sessions/{sessionId}`)

Recommended fields (current backend uses a compatible superset):

- Identity
  - `id` (UUID)
  - `college_id` (string)
  - `teacher_id` (string)
  - `assignment_id` (UUID, optional)
  - `class_id` (UUID)
  - `subject_id` (UUID)

- Scheduling
  - `session_date` (`YYYY-MM-DD`)
  - `scheduled_start_time` (`HH:mm`)
  - `scheduled_end_time` (`HH:mm`)
  - `duration_minutes` (number, optional)
  - `late_threshold_minutes` (number, optional)

- Security requirements
  - `require_photo` (boolean)
  - `require_location` (boolean)
  - `require_wifi` (boolean)

- Location/WiFi policy (when enabled)
  - `geo_latitude` (number)
  - `geo_longitude` (number)
  - `geo_radius_meters` (number)
  - `allowed_wifi_ssids` (string[])

- Runtime status
  - `status` (`scheduled|active|completed|cancelled`)
  - `session_code` (string)
  - `session_code_expires_at` (ISO timestamp)
  - `session_code_expires_at_ms` (epoch ms)
  - `started_at` (ISO timestamp)
  - `started_at_ms` (epoch ms)
  - `ended_at` (ISO timestamp)
  - `ended_at_ms` (epoch ms)

### Attendance Record (`colleges/{collegeId}/attendance_records/{sessionId}/{studentUid}`)

- Identity
  - `id` (UUID)
  - `session_id` (UUID)
  - `student_id` (string)

- Outcome
  - `status` (`present|late|absent|excused`)
  - `verification_status` (`verified|flagged|unverified`)

- Timing
  - `marked_at` (ISO timestamp)
  - `marked_at_ms` (epoch ms)

- Evidence (optional)
  - `photo_url` (string)
  - `wifi_ssid` (string)
  - `device_id` (string)
  - `latitude`, `longitude` (number)
  - `location_accuracy_meters` (number)

- Override
  - `manual_override` (boolean)
  - `override_reason` (string|null)

- Flag metadata (when suspicious)
  - `flag` object with `reasons[]`, geofence/wifi evaluation fields, timestamps

## API Endpoints

### Auth

- `GET /auth/me` — auth context (role + college)
- `GET /auth/profile` — user profile

### Public — Session Discovery (Unauthenticated)

This is the ONLY unauthenticated session discovery endpoint intended for external systems.

- `GET /public/sessions?collegeId=<collegeId>`

Rules:
- No authentication required
- `collegeId` is required
- Returns ONLY sessions with `status="active"`
- Never exposes `session_code`, teacher identity, or internal metadata
- If no active sessions exist, returns an empty array `[]`

Response:

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "sessionId": "<id>",
      "subject": "<subject_name>",
      "className": "<class_name>",
      "status": "active"
    }
  ]
}
```

### Teacher — Sessions

All teacher endpoints require:
- `Authorization: Bearer <token>`

Endpoints:
- `GET /teacher/sessions`
  - Query: `page`, `limit`, `status`, `classId`, `subjectId`, `dateFrom`, `dateTo`
  - `status` allowed: `scheduled|active|completed|cancelled` (legacy alias `ended` accepted)

**Session discovery (active sessions)**

Teachers (and any trusted system acting as a teacher client) MUST use:

- `GET /teacher/sessions?status=active`

Response format:

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {
      "id": "<sessionId>",
      "session_code": "AB12",
      "status": "active",
      "session_date": "2026-04-19",
      "start_time": "09:00",
      "end_time": "10:00",
      "duration_minutes": 60,
      "started_at": "2026-04-19T03:30:00.000Z",
      "ended_at": null,
      "class_name": "CSE-A",
      "subject_name": "Data Structures",
      "attendance_count": 24,
      "total_students": 30
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasMore": false
  }
}
```

- `POST /teacher/sessions`
  - Body supports either:
    - `assignment_id`, or
    - `class_id` + `subject_id`
  - Optional policy fields: `require_photo`, `require_location`, `require_wifi`, geofence/wifi fields

- `GET /teacher/sessions/:sessionId` — session detail (optionally includes attendance)
- `GET /teacher/sessions/:sessionId/enrolled-students?collegeId=...` — trusted internal roster sync endpoint (requires `X-Hexad-Internal-Key`)
- `POST /teacher/sessions/:sessionId/start` — transitions to `active`
- `POST /teacher/sessions/:sessionId/end` — transitions to `completed`
- `POST /teacher/sessions/:sessionId/regenerate-code` — rotates session code

### Student — Attendance

All student endpoints require:
- `Authorization: Bearer <token>`

Endpoints:
- `POST /student/validate-code`
  - Body: `{ code }`
  - Validates session code and returns session policy needed for check-in

- `POST /student/submit-attendance`
  - Default (production) flow: submit by **session code**
  - Optional trusted (internal) flow: submit by **sessionId** (only when internal bypass is enabled)

#### Student attendance — default flow (recommended)

Headers:
- `Authorization: Bearer <firebase_id_token>`

Request body:

```json
{
  "code": "AB12",
  "timestamp": "2026-04-19T09:31:12.123Z",
  "studentId": "<optional; must match token uid>",
  "collegeId": "<optional; must match token collegeId>",
  "deviceId": "<optional>",
  "wifiSsid": "<optional>",
  "photoUrl": "<optional>",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "accuracyMeters": 20
}
```

Response body:

```json
{
  "success": true,
  "message": "Attendance marked",
  "data": {
    "sessionId": "<sessionId>",
    "status": "present",
    "alreadyMarked": false
  }
}
```

If the student already submitted attendance, the server responds with success and:
- `message`: `"Attendance already submitted"`
- `data.alreadyMarked`: `true`

#### Student attendance — trusted/internal flow (sessionId bypass)

This path exists ONLY for internal testing or trusted sources and is **disabled by default**.

Enable by setting:
- `INTERNAL_ATTENDANCE_BYPASS_KEY` (server environment variable)

Request requirements:
- Still requires student auth token (role-based structure remains)
- Must include header: `X-Hexad-Internal-Key: <INTERNAL_ATTENDANCE_BYPASS_KEY>`

Request body (no `code` required):

```json
{
  "sessionId": "<sessionId>",
  "timestamp": "2026-04-19T09:31:12.123Z",
  "studentId": "<optional; must match token uid>",
  "collegeId": "<optional; must match token collegeId>",
  "deviceId": "<optional>",
  "wifiSsid": "<optional>",
  "photoUrl": "<optional>",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "accuracyMeters": 20
}
```

If the header is missing/invalid (or the env var is not set), the server returns `403` and requires a session code.

## Validation + Integrity Rules (Summary)

- `collegeId` must exist on the authenticated user profile.
- Teachers can read/write only sessions for their `collegeId` (and session ownership where applicable).
- Students can submit attendance only for sessions in their `collegeId` where they are enrolled.
- If `studentId` or `collegeId` are provided in the request body, they MUST match the authenticated user context.
- Session code validation uses server time, not device time.
- Duplicate attendance submissions are prevented via RTDB transaction; clients should rely on `data.alreadyMarked`.
- All errors return JSON:
  - `{ success: false, message, errors? }`
