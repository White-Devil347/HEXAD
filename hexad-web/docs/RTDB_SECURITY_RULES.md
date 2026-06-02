# RTDB Security Rules Review (HEXAD)

HEXAD’s web dashboards authenticate with Firebase Auth but **do not read/write RTDB directly** from the browser. All data access goes through the Express API, which uses the Firebase Admin SDK (Admin SDK bypasses RTDB rules).

That means your RTDB rules can be very strict: they primarily protect against accidental direct-client access and reduce blast radius if a client app is misconfigured.

## 1) Current Data Scoping (expected)

The server enforces multi-tenancy primarily by scoping most data under:

- `colleges/{collegeId}/...`

Global (cross-tenant) nodes that exist by design:

- `users/{uid}`: global user profile (contains `collegeId`, `role`, etc.)
- `superadmins/{uid}`: SuperAdmin membership (presence-based)

## 2) Recommended Rule Posture (web-only)

If your clients never touch RTDB directly, the safest baseline is:

- Default deny everything
- Allow reads/writes only where you explicitly need direct client access

A conservative example ruleset:

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

This is compatible with the current architecture because the server uses Admin SDK.

## 3) If You Later Add Direct RTDB Client Access

If a mobile app or web client starts using RTDB client SDK directly, prefer these principles:

- Deny by default; allow the smallest possible path set.
- Never allow users to write their own `role`, `collegeId`, or any privileged flags.
- Avoid tenant-wide reads from the client.

Example (illustrative only): allow an authenticated user to read their own profile, but **deny all client writes** to `users/`:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": false
      }
    }
  }
}
```

If you must allow some client writes, restrict them to a dedicated, low-risk subtree (e.g., `client_requests/{uid}/...`) and validate schema aggressively.

## 4) Common Risk Areas to Double-Check

- **Role escalation**: any client-writable path that can influence `role`, `isSuperAdmin`, or `collegeId`.
- **Cross-tenant data leakage**: any rule that allows listing under `colleges/{collegeId}` without ensuring the caller belongs to that `collegeId`.
- **Bulk reads**: rules that allow reading entire collections (e.g., `colleges/*/users/*`).
- **Audit logs**: logs should be append-only from the server; clients should not be able to edit/delete.

## 5) Operational Checklist

- Confirm your browser/mobile clients do not initialize RTDB client SDK (they currently only use Firebase Auth).
- Ensure service account keys are never committed and are rotated if exposed.
- Keep “default deny” rules unless a direct-client RTDB use case is explicitly required.

## 6) How to Apply Rules

This repo does not currently include Firebase CLI configuration. Typical options:

- Set rules in Firebase Console (Realtime Database → Rules)
- Add Firebase CLI (`firebase-tools`) and a `database.rules.json` file if you want rules-as-code

If you adopt rules-as-code, keep the rules file in version control but keep any secrets (service accounts) out of the repo.
