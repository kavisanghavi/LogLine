/**
 * Firestore Database Client
 * Handles user data, tokens, and installation records
 */

const { Firestore } = require('@google-cloud/firestore');
const { encrypt, decrypt } = require('./encryption');

// Initialize Firestore
const db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    databaseId: 'logline',
});

// Collection references
const usersCollection = db.collection('users');
const installationsCollection = db.collection('installations');

/**
 * Get composite user ID (for multi-workspace support)
 * @param {string} teamId - Slack team/workspace ID
 * @param {string} userId - Slack user ID
 * @returns {string} Composite ID
 */
function getUserDocId(teamId, userId) {
    return `${teamId}:${userId}`;
}

/**
 * Save or update user data with encrypted tokens
 * @param {Object} userData
 * @param {string} userData.teamId - Slack team ID
 * @param {string} userData.userId - Slack user ID
 * @param {string} userData.googleRefreshToken - Google OAuth refresh token
 * @param {string} userData.googleDocId - Google Doc ID
 * @param {string} [userData.timezone] - User's timezone
 * @param {string} [userData.reminderTime] - Daily reminder time (HH:MM)
 */
async function saveUser(userData) {
    const docId = getUserDocId(userData.teamId, userData.userId);

    const dataToSave = {
        slack_user_id: userData.userId,
        slack_team_id: userData.teamId,
        google_doc_id: userData.googleDocId,
        timezone: userData.timezone || 'America/New_York',
        reminder_time: userData.reminderTime || '17:00',
        updated_at: Firestore.FieldValue.serverTimestamp(),
    };

    // Encrypt the refresh token before storing
    if (userData.googleRefreshToken) {
        dataToSave.google_refresh_token = encrypt(userData.googleRefreshToken);
    }

    // Use merge to update existing or create new
    await usersCollection.doc(docId).set(dataToSave, { merge: true });

    return docId;
}

/**
 * Get user data with decrypted tokens
 * @param {string} teamId - Slack team ID
 * @param {string} userId - Slack user ID
 * @returns {Object|null} User data or null if not found
 */
async function getUser(teamId, userId) {
    const docId = getUserDocId(teamId, userId);
    const doc = await usersCollection.doc(docId).get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data();

    // Decrypt the refresh token
    if (data.google_refresh_token) {
        try {
            data.google_refresh_token = decrypt(data.google_refresh_token);
        } catch (error) {
            console.error('Failed to decrypt refresh token:', error.message);
            data.google_refresh_token = null;
        }
    }

    return data;
}

/**
 * Delete user data
 * @param {string} teamId - Slack team ID
 * @param {string} userId - Slack user ID
 */
async function deleteUser(teamId, userId) {
    const docId = getUserDocId(teamId, userId);
    await usersCollection.doc(docId).delete();
}

/**
 * Save Slack workspace installation
 * Supports both bot and user tokens as per Bolt Installation object
 * @param {Object} installation - Bolt installation object
 */
async function saveInstallation(installation) {
    const teamId = installation.team.id;
    const dataToSave = {
        team: installation.team,
        enterprise: installation.enterprise || null,
        user: {
            id: installation.user.id,
            token: installation.user.token ? encrypt(installation.user.token) : null,
            scopes: installation.user.scopes || null,
        },
        bot: {
            id: installation.bot.id,
            userId: installation.bot.userId,
            token: encrypt(installation.bot.token),
            scopes: installation.bot.scopes,
        },
        incomingWebhook: installation.incomingWebhook || null,
        appId: installation.appId,
        isEnterpriseInstall: installation.isEnterpriseInstall || false,
        installed_at: Firestore.FieldValue.serverTimestamp(),
    };

    await installationsCollection.doc(teamId).set(dataToSave);
}

/**
 * Get Slack workspace installation
 * @param {string} teamId - Slack team ID
 * @returns {Object|null} Installation data or null
 */
async function getInstallation(teamId) {
    const doc = await installationsCollection.doc(teamId).get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data();

    // Decrypt tokens
    if (data.bot && data.bot.token) {
        data.bot.token = decrypt(data.bot.token);
    }
    if (data.user && data.user.token) {
        data.user.token = decrypt(data.user.token);
    }

    return data;
}

/**
 * Delete Slack workspace installation
 * @param {string} teamId - Slack team ID
 */
async function deleteInstallation(teamId) {
    await installationsCollection.doc(teamId).delete();
}

/**
 * Get all users for a reminder time (for scheduler)
 * @param {string} reminderTime - Time in HH:MM format
 * @returns {Array} List of users
 */
async function getUsersByReminderTime(reminderTime) {
    const snapshot = await usersCollection
        .where('reminder_time', '==', reminderTime)
        .get();

    const users = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        // Decrypt tokens
        if (data.google_refresh_token) {
            try {
                data.google_refresh_token = decrypt(data.google_refresh_token);
            } catch (error) {
                data.google_refresh_token = null;
            }
        }
        users.push(data);
    });

    return users;
}

/**
 * Update user streak when they log an entry
 * @param {string} teamId - Slack team ID
 * @param {string} userId - Slack user ID
 * @param {string} timezone - User's timezone
 * @returns {number} Current streak count
 */
async function updateStreak(teamId, userId, timezone = 'America/New_York') {
    const docId = getUserDocId(teamId, userId);
    const docRef = usersCollection.doc(docId);
    const doc = await docRef.get();

    if (!doc.exists) {
        return 0;
    }

    const data = doc.data();
    const now = new Date();

    // Get today's date in user's timezone
    const todayStr = now.toLocaleDateString('en-US', { timeZone: timezone });
    const today = new Date(todayStr);
    today.setHours(0, 0, 0, 0);

    // Get last log date
    let lastLogDate = null;
    if (data.last_log_at) {
        const lastLog = data.last_log_at.toDate ? data.last_log_at.toDate() : new Date(data.last_log_at);
        const lastLogStr = lastLog.toLocaleDateString('en-US', { timeZone: timezone });
        lastLogDate = new Date(lastLogStr);
        lastLogDate.setHours(0, 0, 0, 0);
    }

    let newStreak = data.current_streak || 0;
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (!lastLogDate) {
        // First log ever
        newStreak = 1;
    } else if (today.getTime() === lastLogDate.getTime()) {
        // Already logged today, don't change streak
    } else if (today.getTime() - lastLogDate.getTime() === oneDayMs) {
        // Logged yesterday, increment streak
        newStreak += 1;
    } else if (today.getTime() - lastLogDate.getTime() > oneDayMs) {
        // Missed a day, reset streak
        newStreak = 1;
    }

    // Update Firestore
    await docRef.update({
        last_log_at: Firestore.FieldValue.serverTimestamp(),
        current_streak: newStreak,
        longest_streak: Math.max(newStreak, data.longest_streak || 0),
    });

    return newStreak;
}

/**
 * Get all users who should receive reminders (for API endpoint)
 * @returns {Array} List of all users with their settings
 */
async function getAllUsersForReminders() {
    const snapshot = await usersCollection.get();
    const users = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.google_refresh_token) {
            try {
                data.google_refresh_token = decrypt(data.google_refresh_token);
            } catch (error) {
                data.google_refresh_token = null;
            }
        }
        users.push(data);
    });

    return users;
}

module.exports = {
    saveUser,
    getUser,
    deleteUser,
    saveInstallation,
    getInstallation,
    deleteInstallation,
    getUsersByReminderTime,
    updateStreak,
    getAllUsersForReminders,
    db,
};
