/**
 * Google OAuth Service
 * Handles OAuth 2.0 flow and token management
 */

const { google } = require('googleapis');

/**
 * Create OAuth2 client
 * @returns {OAuth2Client}
 */
function createOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}

/**
 * Generate authorization URL for user consent
 * @param {string} state - State parameter (e.g., JSON with userId, teamId)
 * @returns {string} Authorization URL
 */
function getAuthUrl(state) {
    const oauth2Client = createOAuth2Client();

    const scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/documents',
    ];

    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent', // Force consent to get refresh token
        state: state,
    });
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from callback
 * @returns {Object} Token object with access_token, refresh_token, etc.
 */
async function getTokensFromCode(code) {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

/**
 * Create an authenticated OAuth client with refresh token
 * @param {string} refreshToken - User's refresh token
 * @returns {OAuth2Client} Authenticated client
 */
function getAuthenticatedClient(refreshToken) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
        refresh_token: refreshToken,
    });
    return oauth2Client;
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - User's refresh token
 * @returns {Object} New token object
 */
async function refreshAccessToken(refreshToken) {
    const oauth2Client = getAuthenticatedClient(refreshToken);
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials;
}

/**
 * Revoke user's tokens (for cleanup on uninstall)
 * @param {string} refreshToken - User's refresh token
 */
async function revokeToken(refreshToken) {
    const oauth2Client = createOAuth2Client();
    try {
        await oauth2Client.revokeToken(refreshToken);
    } catch (error) {
        console.error('Error revoking token:', error.message);
    }
}

module.exports = {
    createOAuth2Client,
    getAuthUrl,
    getTokensFromCode,
    getAuthenticatedClient,
    refreshAccessToken,
    revokeToken,
};
