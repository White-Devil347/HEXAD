const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const envOrNull = (name) => {
    const value = process.env[name];
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
};

const requiredValue = (name, value) => {
    if (value === undefined || value === null || String(value).trim() === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
};

const loadServiceAccountFromFile = () => {
    const configuredPath = envOrNull('FIREBASE_SERVICE_ACCOUNT_PATH');
    const serviceAccountPath = configuredPath
        ? path.resolve(process.cwd(), configuredPath)
        : path.resolve(__dirname, '../../config/serviceAccountKey.json');

    if (!fs.existsSync(serviceAccountPath)) return null;

    try {
        const raw = fs.readFileSync(serviceAccountPath, 'utf8');
        const json = JSON.parse(raw);
        return {
            projectId: json.project_id || json.projectId || null,
            clientEmail: json.client_email || json.clientEmail || null,
            privateKey: json.private_key || json.privateKey || null
        };
    } catch (e) {
        // Surface a clearer error for invalid JSON or missing keys.
        throw new Error(`Invalid Firebase service account file at ${serviceAccountPath}: ${e.message}`);
    }
};

const getServiceAccount = () => {
    // Env var mode (supports CI and secret managers)
    const envProjectId = envOrNull('FIREBASE_PROJECT_ID');
    const envClientEmail = envOrNull('FIREBASE_CLIENT_EMAIL');
    const envPrivateKey = envOrNull('FIREBASE_PRIVATE_KEY');

    if (envProjectId || envClientEmail || envPrivateKey) {
        return {
            projectId: requiredValue('FIREBASE_PROJECT_ID', envProjectId),
            clientEmail: requiredValue('FIREBASE_CLIENT_EMAIL', envClientEmail),
            privateKey: requiredValue('FIREBASE_PRIVATE_KEY', envPrivateKey).replace(/\\n/g, '\n')
        };
    }

    // File mode (local dev)
    const fromFile = loadServiceAccountFromFile();
    if (!fromFile) {
        throw new Error('Missing Firebase credentials: set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY');
    }

    return {
        projectId: requiredValue('FIREBASE_SERVICE_ACCOUNT_PATH(project_id)', fromFile.projectId),
        clientEmail: requiredValue('FIREBASE_SERVICE_ACCOUNT_PATH(client_email)', fromFile.clientEmail),
        privateKey: requiredValue('FIREBASE_SERVICE_ACCOUNT_PATH(private_key)', fromFile.privateKey)
    };
};

const getDatabaseUrl = (projectId) => {
    const explicit = envOrNull('FIREBASE_DATABASE_URL');
    if (explicit) return explicit;

    // Best-effort fallback for local dev. If your RTDB uses a non-default instance
    // or requires the regional domain, set FIREBASE_DATABASE_URL explicitly.
    if (projectId) {
        const fallback = `https://${projectId}-default-rtdb.firebaseio.com`;
        // eslint-disable-next-line no-console
        console.warn('⚠️ FIREBASE_DATABASE_URL not set; falling back to', fallback);
        return fallback;
    }

    throw new Error('Missing required environment variable: FIREBASE_DATABASE_URL');
};

const initFirebaseAdmin = () => {
    if (admin.apps.length > 0) {
        return admin.app();
    }

    const serviceAccount = getServiceAccount();
    const databaseURL = getDatabaseUrl(serviceAccount.projectId);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL
    });

    return admin.app();
};

const rtdb = () => {
    initFirebaseAdmin();
    return admin.database();
};

const auth = () => {
    initFirebaseAdmin();
    return admin.auth();
};

module.exports = {
    admin,
    initFirebaseAdmin,
    rtdb,
    auth
};
