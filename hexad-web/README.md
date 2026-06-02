# HEXAD - Automated Student Attendance Monitoring System

HEXAD is an attendance monitoring system with web dashboards for Teachers, College Admins, and SuperAdmins.

## 🌟 Features

### Teacher Dashboard
- **Session Management**: Create, start, end, and manage attendance sessions
- **Real-time Attendance**: View live attendance as students mark their presence
- **Session Codes**: Auto-generated 6-character codes with regeneration capability
- **Manual Override**: Override attendance status with audit trail
- **Analytics**: Visual insights with charts and heatmaps
- **Reports**: Export to Excel and PDF formats

### Admin Panel
- **User Management**: CRUD operations for teachers and students
- **Bulk Import**: Import students (JSON payload)
- **Institution Structure**: Manage departments, classes, and subjects
- **Configuration**: System settings, geofences, WiFi networks
- **Monitoring**: Audit logs, sync logs, suspicious activity tracking
- **Storage Health**: Monitor database and storage statistics

### Security Features
- Firebase Authentication (ID token verification on the server)
- Role-based access control (SuperAdmin, Admin, Teacher, Student)
- AES-256 photo encryption
- Server-side time validation (prevents time spoofing)
- Location verification (GPS + Geofence + WiFi)
- Rate limiting and audit logging

## 🛠 Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express.js |
| Frontend | React.js |
| Database | Firebase Realtime Database (RTDB) |
| Authentication | Firebase Auth (client) + Firebase Admin (server) |
| Reports | xlsx, pdfkit |
| Charts | Recharts |
| Icons | Lucide React |

## 📁 Project Structure

```
HEXAD/
├── server/                    # Backend API
│   ├── src/
│   │   ├── config/           # Configuration
│   │   ├── controllers/      # Route handlers
│   │   ├── database/         # DB setup & schema
│   │   ├── middleware/       # Express middleware
│   │   ├── routes/           # API routes
│   │   └── utils/            # Utilities
│   └── package.json
├── client/                    # React Frontend
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   ├── context/          # React context
│   │   ├── pages/            # Page components
│   │   └── services/         # API services
│   └── package.json
├── docs/                      # Documentation
│   ├── API.md                # API Reference
│   ├── ARCHITECTURE.md       # System Architecture
│   ├── DEPLOYMENT.md          # Deployment/hosting guide
│   └── RTDB_SECURITY_RULES.md # RTDB rules review guidance
└── README.md
```

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- npm or yarn

You also need a Firebase project with:
- Firebase Authentication enabled (Email/Password sign-in)
- A Firebase Realtime Database instance
- A service account key JSON for Firebase Admin

### Backend Setup

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set Firebase values

# Start server
npm run dev
```

Backend env vars (see [server/.env.example](server/.env.example)):
- `PORT` (default `5000`)
- `FIREBASE_SERVICE_ACCOUNT_PATH` (default `./config/serviceAccountKey.json`)
- `FIREBASE_DATABASE_URL` (your RTDB URL)

### Frontend Setup

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Configure environment (create .env.local)
# REACT_APP_FIREBASE_API_KEY=
# REACT_APP_FIREBASE_AUTH_DOMAIN=
# REACT_APP_FIREBASE_PROJECT_ID=
# REACT_APP_FIREBASE_APP_ID=

# Start development server
npm start
```

### Access the Application

- **Web Dashboard**: http://localhost:3000
- **API Server**: http://localhost:5000 (or `PORT`)

### Creating Users

This project uses Firebase Auth, so credentials are created via the API endpoints:
- SuperAdmin creates Colleges and Admins
- Admin creates Teachers and Students

After creating a user, they log in using the same email/password via the Login page.

## 📊 API Endpoints

### Authentication
```
GET  /api/auth/me             # Current user (derived from Firebase ID token)
GET  /api/auth/profile        # Profile (if enabled)
```

### Teacher Routes
```
GET  /api/teacher/assignments         # Get assignments
POST /api/teacher/sessions            # Create session
GET  /api/teacher/sessions            # List sessions
GET  /api/teacher/sessions/:id        # Get session details
POST /api/teacher/sessions/:id/start  # Start session
POST /api/teacher/sessions/:id/end    # End session
POST /api/teacher/sessions/:id/regenerate-code  # New code
POST /api/teacher/sessions/:id/override # Override attendance

GET  /api/teacher/analytics           # Get analytics
GET  /api/teacher/analytics/students  # Student analytics
GET  /api/teacher/analytics/insights  # Automated insights
GET  /api/teacher/analytics/heatmap   # Weekly patterns

GET  /api/teacher/reports/excel       # Export Excel
GET  /api/teacher/reports/pdf         # Export PDF
GET  /api/teacher/reports/monthly     # Monthly report
```

### Admin Routes
```
GET  /api/admin/dashboard             # Dashboard stats

# Institution Management
GET/POST/PUT /api/admin/departments
GET/POST/PUT /api/admin/classes
GET/POST     /api/admin/subjects

# User Management
GET        /api/admin/users
GET        /api/admin/users/:userId
POST       /api/admin/users/teachers
POST       /api/admin/users/students
POST       /api/admin/users/students/bulk
PUT        /api/admin/users/:userId

# Configuration
GET/PUT /api/admin/config
GET/POST/PUT/DELETE /api/admin/geofences
GET/POST/PUT/DELETE /api/admin/wifi-networks
GET/POST/PUT /api/admin/retention-policies

# Monitoring
GET /api/admin/audit-logs
GET /api/admin/sync-logs
GET /api/admin/suspicious-activities
POST /api/admin/suspicious-activities/:id/resolve
GET /api/admin/storage-health
```

## 🗄 Data Model (RTDB)

Most tenant data is scoped under `colleges/{collegeId}/...`.

Key paths include:
- `users/{uid}` (global user profile)
- `superadmins/{uid}` (SuperAdmin membership)
- `colleges/{collegeId}/users/{uid}` (college membership index)
- `colleges/{collegeId}/departments/{departmentId}/info`
- `colleges/{collegeId}/classes/{classId}/info`
- `colleges/{collegeId}/subjects/{subjectId}/info`
- `colleges/{collegeId}/teacher_assignments/{teacherUid}/{assignmentId}`

## 🔒 Security Considerations

1. **Time Spoofing Prevention**: All time validations use server time, not device time
2. **Photo Encryption**: Student photos are encrypted at rest using AES-256
3. **JWT Security**: Short-lived access tokens (15 min) with refresh token rotation
4. **Rate Limiting**: API endpoints are rate-limited to prevent abuse
5. **Audit Logging**: All sensitive operations are logged
6. **Input Validation**: All inputs are validated using express-validator
7. **SQL Injection Prevention**: All queries use parameterized statements

## 📈 Future Enhancements

- [ ] Face recognition for photo verification
- [ ] Liveness detection to prevent photo spoofing
- [ ] Push notifications for teachers
- [ ] Integration with LMS systems
- [ ] Multi-language support
- [ ] Dark mode theme

## 📄 License

This project is licensed under the MIT License.

---

**HEXAD** - Making attendance tracking simple, fast ,secure, and smart.
