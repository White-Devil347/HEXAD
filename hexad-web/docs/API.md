# HEXAD - Automated Student Attendance Monitoring System

## API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication
All protected endpoints require a Firebase ID token in the Authorization header:
```
Authorization: Bearer <firebase_id_token>
```

---

## Authentication Endpoints

### GET /auth/profile
Get current user profile.

### GET /auth/me
Get auth context for current user (role + college).

---

## Teacher Endpoints

### GET /teacher/assignments
Get teacher's class-subject assignments.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "class_id": "uuid",
      "class_name": "CSE-A 3rd Year",
      "subject_id": "uuid",
      "subject_name": "Data Structures",
      "student_count": 60
    }
  ]
}
```

### POST /teacher/sessions
Create a new attendance session.

**Request Body:**
```json
{
  "assignment_id": "uuid",
  "session_date": "2024-01-15",
  "start_time": "09:00",
  "end_time": "10:00",
  "duration_minutes": 60,
  "late_threshold_minutes": 15,
  "geofence_radius_meters": 100,
  "require_photo": true,
  "require_location": true,
  "require_wifi": false
}
```

### GET /teacher/sessions
Get all sessions for the teacher.

**Query Parameters:**
- `status`: Filter by status (scheduled, active, completed, cancelled)
- `class_id`: Filter by class
- `start_date`: Filter by start date
- `end_date`: Filter by end date

### GET /teacher/sessions/:id
Get session details with attendance records.

### POST /teacher/sessions/:id/start
Start a scheduled session (changes status to active).

### POST /teacher/sessions/:id/end
End an active session (changes status to completed).

### POST /teacher/sessions/:id/regenerate-code
Regenerate session code for an active session.

### POST /teacher/sessions/:id/override
Override attendance for a student.

**Request Body:**
```json
{
  "student_id": "uuid",
  "status": "present|late|absent|excused",
  "reason": "Reason for override"
}
```

### GET /teacher/sessions/:id/attempts
Get attendance attempts for a session.

### GET /teacher/sessions/:id/flagged
Get flagged (suspicious) students for a session.

---

## Analytics Endpoints

### GET /teacher/analytics
Get attendance analytics.

**Query Parameters:**
- `period`: week, month, semester, year
- `class_id`: Filter by class
- `subject_id`: Filter by subject

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalSessions": 20,
      "totalRecords": 1200,
      "presentCount": 1050,
      "attendancePercentage": 87.5
    },
    "dailyTrend": [...],
    "statusDistribution": [...],
    "verificationStats": [...]
  }
}
```

### GET /teacher/analytics/students
Get student-wise analytics for a class.

### GET /teacher/analytics/insights
Get automated insights and alerts.

### GET /teacher/analytics/heatmap
Get weekly attendance pattern data.

---

## Report Endpoints

### GET /teacher/reports/excel
Export attendance data to Excel.

**Query Parameters:**
- `class_id`: Required
- `subject_id`: Optional
- `start_date`: Optional
- `end_date`: Optional

### GET /teacher/reports/pdf
Export attendance data to PDF.

### GET /teacher/reports/monthly
Generate monthly attendance report.

---

## Admin Endpoints

### Dashboard
#### GET /admin/dashboard
Get admin dashboard statistics.

### Colleges (Super Admin only)
- GET /admin/colleges
- POST /admin/colleges
- PUT /admin/colleges/:id
- DELETE /admin/colleges/:id

### Departments
- GET /admin/departments
- POST /admin/departments
- PUT /admin/departments/:id
- DELETE /admin/departments/:id

### Classes
- GET /admin/classes
- POST /admin/classes
- PUT /admin/classes/:id
- DELETE /admin/classes/:id

### Subjects
- GET /admin/subjects
- POST /admin/subjects
- PUT /admin/subjects/:id
- DELETE /admin/subjects/:id

### Users
- GET /admin/users
- POST /admin/users
- PUT /admin/users/:id
- DELETE /admin/users/:id
- POST /admin/users/bulk-import

### Teacher Assignments
- GET /admin/teachers/assignments
- POST /admin/teachers/assignments
- PUT /admin/teachers/assignments/:id
- DELETE /admin/teachers/assignments/:id

### Configuration
- GET /admin/config
- PUT /admin/config
- GET /admin/geofences
- POST /admin/geofences
- PUT /admin/geofences/:id
- DELETE /admin/geofences/:id
- GET /admin/wifi-networks
- POST /admin/wifi-networks
- PUT /admin/wifi-networks/:id
- DELETE /admin/wifi-networks/:id
- GET /admin/retention-policies
- POST /admin/retention-policies
- PUT /admin/retention-policies/:id

### Monitoring
- GET /admin/audit-logs
- GET /admin/sync-logs
- GET /admin/suspicious-activities
- PUT /admin/suspicious-activities/:id/resolve
- GET /admin/storage-health

---

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "message": "Error description",
  "errors": [] // Optional validation errors
}
```

### HTTP Status Codes
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 422: Validation Error
- 500: Internal Server Error

---

## Role-Based Access Control

| Role | Access Level |
|------|-------------|
| `super_admin` | Full system access, manage colleges |
| `admin` | Institution-level access, manage users and config |
| `teacher` | Own assignments, sessions, analytics, reports |
| `student` | Mobile app only (mark attendance) |

---

## Rate Limiting

- Login: 5 requests per 15 minutes
- General API: 100 requests per minute
- Report generation: 10 requests per hour

---

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@hexad.edu | SuperAdmin@123 |
| Admin | admin@hexad.edu | Admin@123 |
| Teacher | teacher@hexad.edu | Teacher@123 |
