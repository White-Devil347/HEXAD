# Deployment Guide (HEXAD)

This repo is split into:
- `server/`: Express API that talks to Firebase Admin + RTDB
- `client/`: React SPA (Create React App)

## 1) Prerequisites

- Node.js >= 18
- A Firebase project with:
  - Firebase Authentication enabled (Email/Password)
  - Firebase Realtime Database created
  - A **service account JSON** for Firebase Admin SDK

## 2) Environment Variables

### Server (`server/.env`)

See `server/.env.example` for the full list. The important ones:

- `PORT` (default `5000`)
- `FIREBASE_SERVICE_ACCOUNT_PATH` (path to your service account JSON)
- `FIREBASE_DATABASE_URL` (your RTDB URL)
- `CORS_ORIGINS` (comma-separated, e.g. `https://your-ui.com,https://www.your-ui.com`)
- `PHOTO_ENCRYPTION_KEY` (set a strong 32+ char secret; do not use defaults)

### Client (`client/.env.local`)

Firebase Auth config (required):
- `REACT_APP_FIREBASE_API_KEY`
- `REACT_APP_FIREBASE_AUTH_DOMAIN`
- `REACT_APP_FIREBASE_PROJECT_ID`
- `REACT_APP_FIREBASE_APP_ID`

API base URL (optional):
- `REACT_APP_API_URL`

Notes:
- If `REACT_APP_API_URL` is not set, the client calls `/api` (relative to the current origin).
- In development, `client/package.json` uses a CRA `proxy` to `http://localhost:5000`.

## 3) Local Development

### Start the API

```bash
cd server
npm install
cp .env.example .env
# edit server/.env
npm run dev
```

### Start the React app

```bash
cd client
npm install
# create client/.env.local
npm start
```

- UI: `http://localhost:3000`
- API: `http://localhost:5000`

## 4) Production Build

### Build the client

```bash
cd client
npm ci
npm run build
```

The static output will be in `client/build/`.

### Run the server

```bash
cd server
npm ci
npm start
```

## 5) Deployment Patterns

Choose one of these patterns based on how you want routing and CORS to work.

### Pattern A: Same-origin (recommended)

- Serve the React build and the API under the same domain.
- Client uses default `/api` base URL.
- CORS can be very restrictive (or unnecessary if everything is same-origin).

Common approach:
- Put a reverse proxy (nginx/Traefik/Cloud provider routing) in front:
  - `/` -> static `client/build`
  - `/api/*` -> Node server

### Pattern B: Separate domains

- Host UI on `https://ui.example.com`
- Host API on `https://api.example.com`

You must:
- Set `REACT_APP_API_URL=https://api.example.com/api` when building the client
- Set `CORS_ORIGINS=https://ui.example.com` on the server

## 6) Service Account Safety (important)

- Never commit a Firebase service account key.
- Keep it in a secret store (host env var / mounted secret file).

If a key was ever committed or shared:
- Rotate/revoke it in Google Cloud IAM immediately.

## 7) Quick Verification Checklist

- `GET /api/auth/me` works when logged in (Authorization: `Bearer <idToken>`)
- Admin pages load without 401s
- Teacher sessions can be created/started/ended
- CORS is correct for your deployed UI origin
