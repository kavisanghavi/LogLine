/**
 * Firestore Database Client
 * Handles user data, tokens, and installation records
 */

const { Firestore } = require('@google-cloud/firestore');
const { encrypt, decrypt } = require('./encryption');

// Initialize Firestore
const db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
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
 * @param {Object} installation
 * @param {string} installation.teamId - Slack team ID
 * @param {string} installation.botToken - Encrypted bot token
 * @param {string} installation.botId - Bot user ID
 */
async function saveInstallation(installation) {
    await installationsCollection.doc(installation.teamId).set({
        slack_bot_token: encrypt(installation.botToken),
        slack_bot_id: installation.botId,
        installed_at: Firestore.FieldValue.serverTimestamp(),
    });
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

    // Decrypt bot token
    if (data.slack_bot_token) {
        try {
            data.slack_bot_token = decrypt(data.slack_bot_token);
        } catch (error) {
            console.error('Failed to decrypt bot token:', error.message);
            data.slack_bot_token = null;
        }
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

module.exports = {
    saveUser,
    getUser,
    deleteUser,
    saveInstallation,
    getInstallation,
    deleteInstallation,
    getUsersByReminderTime,
    db,
};
