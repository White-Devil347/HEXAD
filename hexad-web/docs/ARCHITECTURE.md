# HEXAD System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HEXAD SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐ │
│  │   Mobile App     │    │  Teacher Panel   │    │  Admin Panel  │ │
│  │   (Student)      │    │   (React SPA)    │    │  (React SPA)  │ │
│  │   - Flutter      │    │                  │    │               │ │
│  └────────┬─────────┘    └────────┬─────────┘    └───────┬───────┘ │
│           │                       │                       │         │
│           └───────────────────────┼───────────────────────┘         │
│                                   │                                  │
│                           ┌───────▼───────┐                         │
│                           │   REST API    │                         │
│                           │  (Express.js) │                         │
│                           └───────┬───────┘                         │
│                                   │                                  │
│    ┌──────────────────────────────┼──────────────────────────────┐  │
│    │                              │                               │  │
│    ▼                              ▼                               ▼  │
│ ┌──────────────────────┐   ┌───────────────┐                       │
│ │ Firebase Realtime DB │   │   File Store  │                       │
│ │ + Firebase Auth      │   │   (Photos)    │                       │
│ └──────────────────────┘   └───────────────┘                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### 1. Attendance Marking Flow (Student Mobile App)

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Student │    │  Enter  │    │ Capture │    │ Verify  │    │ Submit  │
│  Login  │───▶│  Code   │───▶│  Photo  │───▶│Location │───▶│Attendance│
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └────┬────┘
                                                                  │
                    ┌─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SERVER PROCESSING                            │
├─────────────────────────────────────────────────────────────────────┤
│  1. Validate session code (against server time)                      │
│  2. Verify student is enrolled in class                              │
│  3. Check if already marked attendance                               │
│  4. Validate location (geofence check)                               │
│  5. Process photo (encrypt & store)                                  │
│  6. Create attendance record                                         │
│  7. Queue for verification (photo matching - future)                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Teacher Session Management Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Teacher    │     │   Create     │     │  Session     │
│   Login      │────▶│   Session    │────▶│  Created     │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Session    │     │   Students   │     │   Start      │
│   Active     │◀────│   Mark Att.  │◀────│   Session    │
└──────┬───────┘     └──────────────┘     └──────────────┘
       │
       │                              ┌──────────────┐
       │                              │  Regenerate  │
       └─────────────────────────────▶│    Code      │
       │                              └──────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    End       │     │   Review     │     │   Export     │
│   Session    │────▶│  Attendance  │────▶│   Reports    │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 3. Offline Sync Flow (Mobile App)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MOBILE APP                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────┐         ┌──────────────────────┐          │
│  │    Online Mode       │         │    Offline Mode      │          │
│  │    ───────────       │         │    ────────────      │          │
│  │  - Direct API calls  │         │  - Store in SQLite   │          │
│  │  - Real-time sync    │◀───────▶│  - Queue requests    │          │
│  └──────────────────────┘         └──────────┬───────────┘          │
│                                               │                      │
└───────────────────────────────────────────────┼──────────────────────┘
                                                │
                        When connection restored│
                                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           SERVER                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │   Receive   │    │   Validate  │    │   Process   │              │
│  │   Sync Req  │───▶│   Against   │───▶│   & Store   │              │
│  │             │    │ Server Time │    │             │              │
│  └─────────────┘    └─────────────┘    └──────┬──────┘              │
│                                                │                     │
│  ┌─────────────┐    ┌─────────────┐           │                     │
│  │   Create    │◀───│   Log Sync  │◀──────────┘                     │
│  │  Sync Log   │    │   Details   │                                 │
│  └─────────────┘    └─────────────┘                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Entity Relationship

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  COLLEGES   │───┐   │ DEPARTMENTS │───┐   │   CLASSES   │
│  ─────────  │   │   │ ───────────│   │   │  ─────────  │
│  id         │   │   │  id         │   │   │  id         │
│  name       │   └──▶│  college_id │   └──▶│  dept_id    │
│  code       │       │  name       │       │  name       │
└─────────────┘       │  code       │       │  year       │
                      └─────────────┘       │  section    │
                                            └──────┬──────┘
                                                   │
┌─────────────┐       ┌─────────────┐              │
│  SUBJECTS   │       │   USERS     │              │
│  ────────── │       │  ───────    │              │
│  id         │       │  id         │              │
│  name       │       │  email      │              │
│  code       │       │  role       │──────────────┤
│  dept_id    │       │  dept_id    │              │
└──────┬──────┘       └──────┬──────┘              │
       │                     │                     │
       │    ┌────────────────┴──────────────┐     │
       │    │                               │     │
       │    ▼                               ▼     │
       │ ┌──────────────┐          ┌─────────────┐│
       │ │  TEACHER     │          │  STUDENTS   ││
       │ │ ASSIGNMENTS  │          │  ─────────  ││
       │ │ ────────────│          │  id         ││
       │ │  teacher_id  │          │  user_id    │◀┘
       └▶│  class_id    │          │  class_id   │
         │  subject_id  │          │  roll_no    │
         └──────┬───────┘          └──────┬──────┘
                │                         │
                │                         │
                ▼                         ▼
         ┌──────────────┐         ┌─────────────────┐
         │  ATTENDANCE  │         │   ATTENDANCE    │
         │   SESSIONS   │◀────────│    RECORDS      │
         │  ──────────  │         │  ────────────── │
         │  id          │         │  session_id     │
         │  teacher_id  │         │  student_id     │
         │  class_id    │         │  status         │
         │  session_code│         │  marked_at      │
         │  status      │         │  location       │
         └──────────────┘         │  photo_path     │
                                  └─────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SECURITY LAYERS                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Layer 1: Transport                         │  │
│  │  - HTTPS (TLS 1.3)                                            │  │
│  │  - Certificate Pinning (Mobile)                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Layer 2: Authentication                    │  │
│  │  - Firebase Authentication (ID Tokens)                          │  │
│  │  - Server verifies tokens via Firebase Admin SDK                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Layer 3: Authorization                     │  │
│  │  - Role-Based Access Control (RBAC)                            │  │
│  │  - Resource-Level Permissions                                  │  │
│  │  - Middleware Validation                                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Layer 4: Data Protection                   │  │
│  │  - AES-256 Photo Encryption                                    │  │
│  │  - Input Validation (express-validator)                        │  │
│  │  - XSS Prevention (Helmet)                                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     Layer 5: Monitoring                        │  │
│  │  - Audit Logging (all actions)                                 │  │
│  │  - Rate Limiting                                               │  │
│  │  - Suspicious Activity Detection                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Anti-Spoofing Measures

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ANTI-SPOOFING ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. TIME VALIDATION                                                  │
│     ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│     │ Device Time  │─────▶│ Server Time  │─────▶│  Validate    │   │
│     │  (Ignored)   │      │  (Used)      │      │  Window      │   │
│     └──────────────┘      └──────────────┘      └──────────────┘   │
│                                                                      │
│  2. LOCATION VERIFICATION                                            │
│     ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│     │   GPS        │─────▶│  Geofence    │─────▶│   WiFi       │   │
│     │   Check      │      │  Check       │      │   Check      │   │
│     └──────────────┘      └──────────────┘      └──────────────┘   │
│                                                                      │
│  3. PHOTO VERIFICATION                                               │
│     ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│     │   Capture    │─────▶│  Liveness    │─────▶│   Face       │   │
│     │   Photo      │      │  Detection*  │      │   Match*     │   │
│     └──────────────┘      └──────────────┘      └──────────────┘   │
│                                       * Future enhancement           │
│                                                                      │
│  4. SESSION CODE SECURITY                                            │
│     - 6-character alphanumeric code                                  │
│     - Cryptographically random generation                            │
│     - Single use per session                                         │
│     - Regeneration capability                                        │
│     - Time-bounded validity                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Folder Structure

```
HEXAD/
├── server/                    # Backend API
│   ├── src/
│   │   ├── config/           # Configuration
│   │   │   └── index.js
│   │   ├── controllers/      # Route handlers
│   │   │   ├── authController.js
│   │   │   ├── teacherController.js
│   │   │   ├── analyticsController.js
│   │   │   ├── reportController.js
│   │   │   ├── adminController.js
│   │   │   ├── userController.js
│   │   │   ├── configController.js
│   │   │   └── monitoringController.js
│   │   ├── database/         # Database setup
│   │   │   ├── connection.js
│   │   │   ├── init.js
│   │   │   ├── schema.sql
│   │   │   └── seed.js
│   │   ├── middleware/       # Express middleware
│   │   │   ├── auth.js
│   │   │   ├── validate.js
│   │   │   ├── errorHandler.js
│   │   │   ├── audit.js
│   │   │   └── index.js
│   │   ├── routes/           # API routes
│   │   │   ├── auth.js
│   │   │   ├── teacher.js
│   │   │   ├── admin.js
│   │   │   └── index.js
│   │   ├── utils/            # Utilities
│   │   │   ├── crypto.js
│   │   │   ├── dateTime.js
│   │   │   ├── response.js
│   │   │   └── index.js
│   │   └── index.js          # Entry point
│   ├── uploads/              # Photo storage
│   ├── package.json
│   └── .env.example
│
├── client/                    # Frontend React App
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   │   └── Layout.js
│   │   ├── context/          # React context
│   │   │   └── AuthContext.js
│   │   ├── pages/            # Page components
│   │   │   ├── Login.js
│   │   │   ├── teacher/
│   │   │   │   ├── Dashboard.js
│   │   │   │   ├── Sessions.js
│   │   │   │   ├── Analytics.js
│   │   │   │   └── Reports.js
│   │   │   └── admin/
│   │   │       ├── Dashboard.js
│   │   │       ├── Users.js
│   │   │       ├── Institution.js
│   │   │       ├── Configuration.js
│   │   │       └── Monitoring.js
│   │   ├── services/         # API services
│   │   │   └── api.js
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
│
├── docs/                      # Documentation
│   ├── API.md
│   └── ARCHITECTURE.md
│
└── README.md
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React.js | Single Page Application |
| Backend | Node.js + Express | REST API Server |
| Database | Firebase Realtime Database | Multi-tenant data storage |
| Auth | Firebase ID Tokens | Authentication & Authorization |
| Validation | express-validator | Input Validation |
| Security | Helmet, CORS, Rate Limit | API Security |
| Reports | xlsx, pdfkit | Report Generation |
| Encryption | crypto-js | Photo Encryption |
