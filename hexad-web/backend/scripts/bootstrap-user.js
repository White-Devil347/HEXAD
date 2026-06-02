#!/usr/bin/env node

const path = require('path');

// Ensure relative paths (like FIREBASE_SERVICE_ACCOUNT_PATH=./config/...) resolve from backend/
process.chdir(path.join(__dirname, '..'));

require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const { auth, rtdb } = require('../src/firebase/firebase');

const parseArgs = (argv) => {
    const args = {};

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;

        const key = token.slice(2);
        const next = argv[i + 1];

        if (!next || next.startsWith('--')) {
            args[key] = true;
            continue;
        }

        args[key] = next;
        i += 1;
    }

    return args;
};

const toBool = (value) => {
    if (value === true) return true;
    if (value === false) return false;
    if (value == null) return undefined;

    const v = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
    return undefined;
};

const readVal = async (p) => {
    const snap = await rtdb().ref(p).once('value');
    return snap.val();
};

const ensureCollege = async ({ collegeId, collegeName }) => {
    if (!collegeId || !collegeName) return;

    const infoPath = `colleges/${collegeId}/info`;
    const existing = await readVal(infoPath);
    if (existing) return;

    const nowMs = Date.now();
    await rtdb().ref(infoPath).set({
        collegeId,
        name: collegeName,
        isActive: true,
        created_at_ms: nowMs,
        created_at: new Date(nowMs).toISOString()
    });
};

const main = async () => {
    const args = parseArgs(process.argv);

    if (args.help || args.h) {
        console.log(`\nUsage:\n  npm --prefix server run bootstrap-user -- --email <email> --role <admin|teacher|student|superadmin> [options]\n\nOptions:\n  --uid <uid>                 Use UID instead of email\n  --collegeId <collegeId>      Required for admin/teacher/student\n  --createCollegeName <name>   Creates colleges/<collegeId>/info if missing\n  --firstName <name> --lastName <name> --phone <phone>\n  --classId <classId>          (student) writes class membership index\n  --rollNumber <roll> --enrollmentYear <year>\n  --isActive <true|false>      Defaults to true if not set\n  --setSuperAdmin <true|false> Also writes superadmins/<uid>=true\n\nExamples:\n  npm --prefix server run bootstrap-user -- --email admin@x.com --role superadmin --setSuperAdmin true\n  npm --prefix server run bootstrap-user -- --email teacher@x.com --role teacher --collegeId COL001 --firstName A --lastName B\n`);
        return;
    }

    const email = args.email ? String(args.email).trim() : '';
    const uidArg = args.uid ? String(args.uid).trim() : '';

    const role = args.role ? String(args.role).trim() : '';
    const collegeId = args.collegeId ? String(args.collegeId).trim() : '';

    const firstName = args.firstName ? String(args.firstName).trim() : null;
    const lastName = args.lastName ? String(args.lastName).trim() : null;
    const phone = args.phone ? String(args.phone).trim() : null;

    const classId = args.classId ? String(args.classId).trim() : null;
    const rollNumber = args.rollNumber ? String(args.rollNumber).trim() : null;
    const enrollmentYear = args.enrollmentYear != null ? Number(args.enrollmentYear) : null;

    const isActive = toBool(args.isActive);
    const setSuperAdmin = toBool(args.setSuperAdmin) === true;

    const createCollegeName = args.createCollegeName ? String(args.createCollegeName).trim() : '';

    if (!uidArg && !email) {
        console.error('Missing --email (or --uid).');
        process.exit(1);
    }

    if (!role) {
        console.error('Missing --role (admin|teacher|student).');
        process.exit(1);
    }

    if (role !== 'superadmin' && role !== 'admin' && role !== 'teacher' && role !== 'student') {
        console.error('Invalid --role. Use one of: superadmin, admin, teacher, student');
        process.exit(1);
    }

    if (role !== 'superadmin' && !collegeId) {
        console.error('Missing --collegeId for non-superadmin roles.');
        process.exit(1);
    }

    if (role === 'student' && !classId) {
        console.warn('Note: role=student but no --classId provided (class index will not be written).');
    }

    if (createCollegeName && !collegeId) {
        console.error('If using --createCollegeName, you must also pass --collegeId.');
        process.exit(1);
    }

    await ensureCollege({ collegeId, collegeName: createCollegeName || null });

    const userRecord = uidArg
        ? await auth().getUser(uidArg)
        : await auth().getUserByEmail(email);

    const uid = userRecord.uid;

    const existingProfile = await readVal(`users/${uid}`);

    const nowMs = Date.now();

    const mergedProfile = {
        ...(existingProfile || {}),
        uid,
        email: userRecord.email || email || (existingProfile && existingProfile.email) || null,
        role: role === 'superadmin' ? 'admin' : role,
        collegeId: role === 'superadmin' ? (existingProfile && existingProfile.collegeId) || null : collegeId,
        isActive: typeof isActive === 'boolean' ? isActive : (existingProfile && typeof existingProfile.isActive === 'boolean' ? existingProfile.isActive : true),
        firstName: firstName !== null ? firstName : (existingProfile && existingProfile.firstName) || null,
        lastName: lastName !== null ? lastName : (existingProfile && existingProfile.lastName) || null,
        phone: phone !== null ? phone : (existingProfile && existingProfile.phone) || null,
        created_at_ms: (existingProfile && existingProfile.created_at_ms) || nowMs,
        created_at: (existingProfile && existingProfile.created_at) || new Date((existingProfile && existingProfile.created_at_ms) || nowMs).toISOString(),
        updated_at_ms: nowMs,
        updated_at: new Date(nowMs).toISOString()
    };

    const updates = {};

    updates[`users/${uid}`] = mergedProfile;

    if (role !== 'superadmin' && collegeId) {
        updates[`colleges/${collegeId}/users/${uid}`] = true;

        if (role === 'admin') {
            updates[`colleges/${collegeId}/admins/${uid}`] = true;
        }

        if (role === 'teacher') {
            updates[`colleges/${collegeId}/teachers/${uid}/info`] = {
                uid,
                email: mergedProfile.email,
                firstName: mergedProfile.firstName,
                lastName: mergedProfile.lastName,
                phone: mergedProfile.phone,
                isActive: mergedProfile.isActive,
                created_at_ms: mergedProfile.created_at_ms
            };
        }

        if (role === 'student') {
            updates[`colleges/${collegeId}/students/${uid}/info`] = {
                uid,
                email: mergedProfile.email,
                firstName: mergedProfile.firstName,
                lastName: mergedProfile.lastName,
                phone: mergedProfile.phone,
                classId: classId || (existingProfile && existingProfile.classId) || null,
                rollNumber: rollNumber || (existingProfile && existingProfile.rollNumber) || null,
                enrollmentYear: Number.isFinite(enrollmentYear) ? enrollmentYear : (existingProfile && existingProfile.enrollmentYear) || null,
                isActive: mergedProfile.isActive,
                created_at_ms: mergedProfile.created_at_ms
            };

            if (classId) {
                updates[`colleges/${collegeId}/classes/${classId}/students/${uid}`] = true;
            }
        }
    }

    if (setSuperAdmin || role === 'superadmin') {
        updates[`superadmins/${uid}`] = true;
    }

    await rtdb().ref().update(updates);

    console.log('✅ Bootstrapped user into RTDB');
    console.log(JSON.stringify({
        uid,
        email: mergedProfile.email,
        role: mergedProfile.role,
        collegeId: mergedProfile.collegeId,
        isActive: mergedProfile.isActive,
        isSuperAdmin: setSuperAdmin || role === 'superadmin'
    }, null, 2));
};

main().catch((err) => {
    console.error('❌ bootstrap-user failed:', err?.message || err);
    process.exit(1);
});
