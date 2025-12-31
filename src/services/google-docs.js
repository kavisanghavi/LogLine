/**
 * Google Docs Service
 * Handles document creation, reading, and appending entries
 */

const { google } = require('googleapis');
const { getAuthenticatedClient } = require('./oauth');
const { getTodayHeading } = require('../utils/date-formatter');

/**
 * Create a new Google Doc for daily check-ins
 * @param {string} refreshToken - User's Google refresh token
 * @param {string} userName - User's name for the doc title
 * @returns {Object} Created document info
 */
async function createCheckinDoc(refreshToken, userName = 'User') {
    const auth = getAuthenticatedClient(refreshToken);
    const docs = google.docs({ version: 'v1', auth });

    const title = `Daily Check-ins - ${userName}`;

    // Create the document
    const doc = await docs.documents.create({
        requestBody: {
            title: title,
        },
    });

    // Add initial heading
    await docs.documents.batchUpdate({
        documentId: doc.data.documentId,
        requestBody: {
            requests: [
                {
                    insertText: {
                        location: { index: 1 },
                        text: '# Daily Check-ins\n\n',
                    },
                },
            ],
        },
    });

    return {
        docId: doc.data.documentId,
        docUrl: `https://docs.google.com/document/d/${doc.data.documentId}/edit`,
        title: title,
    };
}

/**
 * Get document content
 * @param {string} refreshToken - User's Google refresh token
 * @param {string} docId - Google Doc ID
 * @returns {Object} Document content
 */
async function getDocContent(refreshToken, docId) {
    const auth = getAuthenticatedClient(refreshToken);
    const docs = google.docs({ version: 'v1', auth });

    const doc = await docs.documents.get({
        documentId: docId,
    });

    return doc.data;
}

/**
 * Extract text content from document
 * @param {Object} doc - Google Docs document object
 * @returns {string} Plain text content
 */
function extractTextContent(doc) {
    let text = '';

    if (doc.body && doc.body.content) {
        for (const element of doc.body.content) {
            if (element.paragraph && element.paragraph.elements) {
                for (const el of element.paragraph.elements) {
                    if (el.textRun && el.textRun.content) {
                        text += el.textRun.content;
                    }
                }
            }
        }
    }

    return text;
}

/**
 * Find the position to insert content for today's date
 * @param {Object} doc - Google Docs document object
 * @param {string} todayHeading - Today's date heading
 * @returns {Object} Insert position info
 */
function findInsertPosition(doc, todayHeading) {
    const content = doc.body.content;
    let headingFound = false;
    let insertIndex = null;
    let needsNewHeading = true;

    for (let i = 0; i < content.length; i++) {
        const element = content[i];

        if (element.paragraph && element.paragraph.elements) {
            const paragraphText = element.paragraph.elements
                .map(el => el.textRun?.content || '')
                .join('')
                .trim();

            // Check if this paragraph contains today's heading
            if (paragraphText.includes(todayHeading)) {
                headingFound = true;
                needsNewHeading = false;
                // Find end of this paragraph to start inserting after
                insertIndex = element.endIndex - 1;
                continue;
            }

            // If we found today's heading and hit another date heading, insert before it
            if (headingFound && paragraphText.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/)) {
                break;
            }

            // Track last position after heading
            if (headingFound) {
                insertIndex = element.endIndex - 1;
            }
        }
    }

    // If no heading found, we'll add at the beginning (after title)
    if (!headingFound) {
        // Find position after "# Daily Check-ins" title
        for (let i = 0; i < content.length; i++) {
            const element = content[i];
            if (element.paragraph && element.paragraph.elements) {
                const text = element.paragraph.elements
                    .map(el => el.textRun?.content || '')
                    .join('');
                if (text.includes('Daily Check-ins') || text.includes('# ')) {
                    insertIndex = element.endIndex;
                    break;
                }
            }
        }

        // Default to position 2 if nothing found
        if (!insertIndex) {
            insertIndex = 2;
        }
    }

    return {
        index: insertIndex,
        needsNewHeading: needsNewHeading,
    };
}

/**
 * Append an entry to the user's Google Doc
 * @param {string} refreshToken - User's Google refresh token
 * @param {string} docId - Google Doc ID
 * @param {string} entry - Entry text (can be multiple lines)
 * @param {string} timezone - User's timezone
 * @returns {boolean} Success status
 */
async function appendEntry(refreshToken, docId, entry, timezone = 'America/New_York') {
    const auth = getAuthenticatedClient(refreshToken);
    const docs = google.docs({ version: 'v1', auth });

    // Get current doc content
    const doc = await docs.documents.get({ documentId: docId });

    const todayHeading = getTodayHeading(timezone);
    const position = findInsertPosition(doc.data, todayHeading);

    const requests = [];

    // Format entry as bullet point
    const bulletEntry = `• ${entry}\n`;

    if (position.needsNewHeading) {
        // Insert new date heading first
        const headingText = `\n## ${todayHeading}\n`;
        requests.push({
            insertText: {
                location: { index: position.index },
                text: headingText + bulletEntry,
            },
        });
    } else {
        // Just insert the bullet entry
        requests.push({
            insertText: {
                location: { index: position.index },
                text: bulletEntry,
            },
        });
    }

    await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests },
    });

    return true;
}

/**
 * Get entries for a date range (for weekly summary)
 * @param {string} refreshToken - User's Google refresh token
 * @param {string} docId - Google Doc ID
 * @param {Date} startDate - Start of range
 * @param {Date} endDate - End of range
 * @returns {Array} List of entries
 */
async function getEntriesForDateRange(refreshToken, docId, startDate, endDate) {
    const doc = await getDocContent(refreshToken, docId);
    const text = extractTextContent(doc);

    // Parse entries by date heading
    const entries = [];
    const lines = text.split('\n');
    let currentDate = null;

    for (const line of lines) {
        const dateMatch = line.match(/^##?\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+)\s+(\d+)\w+,\s+(\d+)/);

        if (dateMatch) {
            const monthNames = {
                'January': 0, 'February': 1, 'March': 2, 'April': 3,
                'May': 4, 'June': 5, 'July': 6, 'August': 7,
                'September': 8, 'October': 9, 'November': 10, 'December': 11
            };
            const year = parseInt(dateMatch[4]);
            const month = monthNames[dateMatch[2]];
            const day = parseInt(dateMatch[3]);
            currentDate = new Date(year, month, day);
            continue;
        }

        if (currentDate && line.trim().startsWith('•')) {
            // Check if date is in range
            if (currentDate >= startDate && currentDate <= endDate) {
                entries.push({
                    date: currentDate,
                    text: line.trim().substring(1).trim(),
                });
            }
        }
    }

    return entries;
}

module.exports = {
    createCheckinDoc,
    getDocContent,
    extractTextContent,
    appendEntry,
    getEntriesForDateRange,
};
