# Hexad Simulator

A full-stack web application for generating fake students and simulating realistic attendance behavior in bulk. This is an **independent testing tool** for use in controlled environments only.

## 🎯 Features

- ✨ **Student Generation** - Create realistic fake students with auto-generated names and emails
- 📊 **Data Export** - Export student data as JSON or CSV
- 🎓 **Live Sessions** - Fetch and display sessions from external API
- 🎬 **Bulk Simulation** - Run realistic attendance simulations with configurable parameters
- 📡 **Real-time Logs** - Live progress tracking and detailed simulation logs
- 🎨 **Premium UI** - Dark theme with smooth animations and modern design
- 🔄 **Schema Integration** - Auto-adapts to backend attendance rules using dynamic schema

## 🧱 Tech Stack

- **Frontend**: React 18, Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express
- **Database**: MongoDB Atlas (cloud)
- **Hosting**: Backend serves React build (single server)

## 📋 Prerequisites

- Node.js 16+
- npm or yarn
- MongoDB Atlas account (or local MongoDB)

## 🚀 Quick Start

### 1. Clone & Install Dependencies

```bash
cd d:\Git\ Projects\Git\ repos\Hexad\ Simulation

# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### 2. Configure Environment Variables

**Backend** - Create `server/.env`:

```env
# MongoDB Connection (use your MongoDB Atlas URI)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/hexad-simulator
PORT=5000
NODE_ENV=development

# Hexad Production Backend (REQUIRED for sessions + trusted attendance)
HEXAD_API_BASE_URL=https://hexad-api.onrender.com/api

# Trusted internal key (MUST match backend INTERNAL_ATTENDANCE_BYPASS_KEY)
HEXAD_INTERNAL_KEY=replace-with-your-internal-key

# Default college ID
COLLEGE_ID=college_001
```

**Frontend** - Create `client/.env`:

```env
# If frontend and backend are deployed separately, set one of these at build time:
# Option A: full API prefix (recommended)
REACT_APP_API_BASE_URL=http://localhost:5000/api

# Option B: backend origin (the app will append /api)
# REACT_APP_API_URL=http://localhost:5000
```

### 3. Start the Development Servers

**Terminal 1 - Backend**:

```bash
cd server
npm run dev
```

Backend will run on `http://localhost:5000`

**Terminal 2 - Frontend** (optional for separate dev):

```bash
cd client
npm start
```

Frontend will run on `http://localhost:3000` (proxies to backend)

### 4. Access the App

Open your browser and navigate to:

```
http://localhost:5000
```

Or if running frontend separately:

```
http://localhost:3000
```

## 📖 Usage Guide

### Generate Students

1. Enter number of students (1-10,000)
2. Set student ID prefix (e.g., "STU")
3. Set starting number (e.g., 001 or 1000)
4. Set domain (e.g., "hexad.test")
5. Click **"Generate Students"** or **"🎲 Randomize"** for quick setup

Generated students are stored in MongoDB with realistic names, emails, phone numbers, and gender.

### Export Data

Click **"📄 JSON"** or **"📋 CSV"** to download student data for import into the main Hexad system.

### Configure API Endpoints

1. Enter your external Hexad API base URL (e.g., `http://hexad-api.example.com/api`)
2. Enter sessions endpoint path (e.g., `/sessions`)
3. Enter attendance submission endpoint (e.g., `/attendance`)
4. Click **"Save Configuration"**

### Fetch Live Sessions

1. Click **"📡 Fetch Sessions"** in the Live Sessions panel
2. Sessions are fetched from the Hexad **public** endpoint: `GET /public/sessions?collegeId=...`
3. The UI displays `subject` + `className`. If none are returned, it shows **"No active sessions"**.
4. Click **"Open Session →"** to start simulating

### Run Simulations

1. Select a session from Live Sessions
2. Configure simulation parameters:
  - **Delay Range**: Realistic delays in milliseconds (instant mode: 0-0)
  - **Retry Attempts**: How many times to retry retryable failures
3. Click **"🚀 Send Simulation"** to execute

The simulator backend submits attendance in **trusted mode** to `POST /student/submit-attendance` and attaches `X-Hexad-Internal-Key` **server-side only**.

### Monitor Simulation

- **Progress Bar**: Visual progress indicator
- **Stats**: Total, succeeded, failed, retried counts
- **Live Logs**: Real-time log stream with student results
- **Status**: Shows queued → running → completed states

## 📊 API Endpoints

### Students

- `POST /api/students/generate` - Generate bulk students
- `GET /api/students` - Fetch all students
- `GET /api/students/:id` - Get single student
- `DELETE /api/students/:id` - Delete student
- `DELETE /api/students/batch/all` - Delete all students

### Export

- `GET /api/export/json` - Export as JSON
- `GET /api/export/csv` - Export as CSV

### Sessions

- `GET /api/sessions?collegeId=college_001` - Fetch active sessions (proxies to Hexad public sessions)
- `POST /api/sessions/fetch` - Back-compat alias for fetching sessions (body: `{ collegeId }`)

### Simulation

- `POST /api/simulation/execute` - Execute simulation
- `GET /api/simulation/status/:jobId` - Get job status
- `GET /api/simulation/logs` - Get logs (filterable by sessionId)
- `GET /api/simulation/job/:jobId` - Get job details

### Configuration

- `GET /api/config` - Get current API config
- `POST /api/config` - Update API config

### Schema (v2.0+)

- `GET /api/schema/attendance` - Get attendance schema from backend
- `POST /api/schema/attendance/fetch` - Fetch and cache schema
- `GET /api/schema/status` - Check schema load status
- `POST /api/schema/attendance/validate` - Validate payload against schema
- `DELETE /api/schema/cache/clear` - Clear schema cache

### Health

- `GET /api/health` - Server health check

## 🏗️ Project Structure

```
hexad-simulator/
├── server/                    # Backend (Node.js + Express)
│   ├── config/               # Configuration files
│   ├── models/               # MongoDB schemas
│   ├── routes/               # API routes
│   ├── utils/                # Utility functions
│   ├── middleware/           # Express middleware
│   ├── app.js                # Express app setup
│   ├── server.js             # Server entry point
│   └── package.json
├── client/                    # Frontend (React)
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/            # Page components
│   │   ├── hooks/            # Custom hooks
│   │   ├── styles/           # CSS files
│   │   ├── App.jsx           # Main app component
│   │   └── index.js          # Entry point
│   ├── public/               # Static files
│   └── package.json
├── .gitignore
└── README.md
```

## 🎨 UI/UX Features

- **Dark Theme**: Black/dark gray background with purple/blue accents
- **Smooth Animations**: Framer Motion powered transitions
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Loading States**: Skeleton loaders for data fetching
- **Error Handling**: Clear error messages and validation
- **Pagination**: Efficient student list navigation
- **Real-time Logs**: Live streaming of simulation events

## ⚙️ Configuration

### Environment Variables

**Backend** (`server/.env`):

```env
# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/hexad-simulator

# Server
PORT=5000
NODE_ENV=development

# External Hexad backend (REQUIRED for sessions + trusted attendance)
HEXAD_API_BASE_URL=https://your-hexad-backend.example.com/api

# Trusted internal key (attendance submission only)
HEXAD_INTERNAL_KEY=replace-with-your-internal-key

# Default college
COLLEGE_ID=college_001

# Optional: reduce upstream rate limits (sessions proxy cache)
# Default is 15000 (15s)
SESSIONS_CACHE_TTL_MS=15000
```

**Frontend** (`client/.env`):

```env
# Most deployments do NOT need this.
# By default the frontend calls same-origin `/api`.
#
# Only set these if the frontend is hosted separately from the backend.

# Option A (recommended): full API prefix
# REACT_APP_API_BASE_URL=https://your-backend.example.com/api

# Option B: backend origin (app appends /api)
# REACT_APP_API_URL=https://your-backend.example.com
```

### API Configuration (Via UI)

The API configuration controls which **external Hexad backend** the server proxies to.
You can update it in the UI (API Configuration tab) or via:

```bash
curl -X POST http://localhost:5000/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "baseURL": "http://your-api.com/api",
    "sessionsEndpoint": "/sessions",
    "attendanceEndpoint": "/attendance"
  }'
```

Note: This does **not** change the frontend-to-simulator URL. The frontend always talks to the simulator backend via `/api` (same origin) unless you build the frontend with `REACT_APP_API_BASE_URL`/`REACT_APP_API_URL`.

## 📖 Usage Guide

### Generate Students

- [ ] Generate 10 students → Verify in DB
- [ ] Export JSON/CSV → Validate files
- [ ] Configure API → Save and verify
- [ ] Fetch sessions → Load from API
- [ ] Run simulation (100% success) → All should pass
- [ ] Run simulation (50% success) → Roughly half should fail
- [ ] Check logs → Verify accuracy
- [ ] Test pagination → Navigate student list
- [ ] Mobile responsive → Test on small screen

## 🚢 Deployment

### Render (Single Service: recommended)

This repo is set up for a single deployed service where the Express backend serves the React build.

- The server serves static files from `client/build`.
- The frontend calls `/api/...` on the same domain.

**Render settings (example)**

- **Build Command**:

```bash
npm ci --prefix client
npm run build --prefix client
npm ci --prefix server
```

- **Start Command**:

```bash
node server/server.js
```

- **Environment Variables** (Render dashboard):
  - `NODE_ENV=production`
  - `MONGODB_URI=...`
  - `HEXAD_API_BASE_URL=...`
  - `COLLEGE_ID=...`
  - `HEXAD_INTERNAL_KEY=...` (required for attendance submission)
  - Optional: `SESSIONS_CACHE_TTL_MS=30000`

If your deployed site is `https://hexad-simulation.onrender.com/`, you typically do **not** need any `client/.env` variables.

### Production Build (Manual)

```bash
# Frontend
cd client
npm run build

# This creates client/build/

# Backend
cd ../server
npm install --production
NODE_ENV=production npm start
```

Backend will serve the optimized React build on the configured PORT.

### Docker (Optional)

A `docker-compose.yml` can be added for containerized deployment with MongoDB.

## ⚠️ Important Notes

- **Testing Only**: This tool is for testing environments only, not production
- **No Authentication**: Security is not implemented; assume restricted network access
- **Data Privacy**: Do not use with real student data
- **API Configuration**: Must be set to match your actual Hexad backend endpoints
- **MongoDB**: Requires MongoDB Atlas connection or local MongoDB instance

## 🐛 Troubleshooting

### Deployed UI goes blank / black screen

- A runtime UI crash can look like a blank page.
- This repo includes an error boundary so the UI should show an error card instead of going fully blank.
- If it still happens on deploy, check the browser console and verify your backend is reachable.

### Sessions fetch returns 429 Too Many Requests

- 429 typically comes from the **external Hexad backend** rate-limiting the simulator’s proxy call.
- Mitigations:
  - Avoid rapid refresh clicks (wait for `Retry-After` if returned).
  - Increase `SESSIONS_CACHE_TTL_MS` (example: `30000`) to reduce upstream calls.
  - Confirm `HEXAD_API_BASE_URL` is correct and points to the intended backend.

### MongoDB Connection Failed

- Verify MongoDB Atlas connection string
- Check firewall/network access
- Ensure credentials are correct
- Whitelist your IP in MongoDB Atlas

### API Configuration Issues

- Use the Configuration panel to update endpoints
- Verify external API is running and accessible
- Check endpoint paths match your API

### Simulation Not Running

- Verify students are generated
- Check MongoDB connection
- Review browser console for errors
- Ensure API endpoints are correctly configured

## 🔄 Schema Integration (v2.0+)

The simulator now **dynamically adapts to backend attendance submission rules** using schema as the single source of truth.

### How It Works

1. **App loads** → Fetches `GET /api/schema/attendance` from your backend
2. **Schema cached** → Stored for 30 minutes (performance)
3. **Before simulation** → Checks if schema is loaded (shows ✅ or ❌ badge)
4. **During execution** → Builds payload dynamically using schema fields
5. **Validation** → All payloads validated before sending
6. **Logging** → Field counts and validation errors tracked

### Backend Schema Format

Your Hexad API should provide schema at `/api/schema/attendance`:

```json
{
  "version": "1.0",
  "endpoint": "http://api.example.com/attendance",
  "method": "POST",
  "headers": { "Content-Type": "application/json" },
  "fields": {
    "studentId": {
      "type": "string",
      "required": true,
      "description": "Student ID"
    },
    "sessionId": {
      "type": "string",
      "required": true,
      "description": "Session ID"
    },
    "timestamp": {
      "type": "string",
      "format": "ISO8601",
      "required": true,
      "description": "Attendance timestamp"
    },
    "attendanceStatus": {
      "type": "string",
      "enum": ["present", "absent", "late"],
      "default": "present",
      "required": false
    }
  }
}
```

### Frontend Experience

- **Schema Status Badge** - Shows ✅ Loaded, ❌ Failed, or ⏳ Loading
- **Disabled Simulation** - Button disabled until schema loads
- **Enhanced Logs** - Shows field count: `(5f)` = 5 fields sent
- **Validation Errors** - Displays validation issues in real-time
- **Retry Button** - Manual schema refresh if fetch fails

### Example Log Output

```
✓ STU001 - rohan.sharma - Success (5f)
✗ STU002 - jane.doe - Failed - Validation: Missing required field (5f)
↻ STU003 - john.smith - Retried (2/3) (5f) ⚠ Type mismatch
```

Legend: `(5f)` = 5 fields, `⚠` = validation warning

### Key Benefits

✅ **Never sends invalid data** - All payloads validated  
✅ **Auto-adapts** - Works with any backend schema  
✅ **Fallback support** - Uses default schema if fetch fails  
✅ **Production-ready** - Full validation and error handling  
✅ **Debuggable** - Field counts and errors in logs  

## 🧪 Testing

### Manual Testing Checklist

- [ ] Generate 10 students → Verify in DB and UI
- [ ] Export JSON/CSV → Validate files
- [ ] Schema loads → Shows "✅ Schema Loaded"
- [ ] Configure API → Save and verify
- [ ] Fetch sessions → Load from API
- [ ] Run simulation (100% success) → All should pass
- [ ] Run simulation (50% success) → Roughly half should fail
- [ ] Check logs → Verify accuracy and field counts
- [ ] Test pagination → Navigate student list
- [ ] Mobile responsive → Test on small screen

## 📝 License

MIT

## 👤 Support

For issues or questions, please check the console logs and verify all environment variables are set correctly.