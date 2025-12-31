/**
 * LLM Service (Gemini API)
 * Handles input refinement and weekly summary generation
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini client (lazy loaded after env vars are available)
let genAI = null;

function getClient() {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is required');
        }
        genAI = new GoogleGenerativeAI(apiKey);
    }
    return genAI;
}

/**
 * Refine a user's raw input into structured bullet points
 * @param {string} rawInput - User's raw message
 * @returns {string} Refined entry text
 */
async function refineEntry(rawInput) {
    // If Gemini is not configured, return the raw input cleaned up
    if (!process.env.GEMINI_API_KEY) {
        return cleanupEntry(rawInput);
    }

    try {
        const client = getClient();
        const model = client.getGenerativeModel({ model: 'gemini-flash-latest' });

        const prompt = `Clean up this work log entry. Only fix grammar and make it read naturally - do NOT add any details, context, or information that wasn't in the original.

Rules:
- NEVER invent or assume details not explicitly stated
- Only fix spelling, grammar, and sentence structure
- Keep the exact same meaning and level of detail
- Plain text only, no markdown
- Start with a past-tense verb if possible
- If the input is already clear, return it mostly as-is

Examples:
- "fixed 3 bugs" → "Fixed 3 bugs"
- "meeting with design about the new feature" → "Had a meeting with design about the new feature"
- "This is the first entry" → "This is the first entry"

Input: "${rawInput}"

Output:`;

        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();

        // If the response has multiple lines, format as bullet points
        const lines = response.split('\n').filter(l => l.trim());
        if (lines.length > 1) {
            return lines.map(l => l.replace(/^[-•*]\s*/, '').trim()).join('\n• ');
        }

        return response.replace(/^[-•*]\s*/, '').trim();
    } catch (error) {
        console.error('LLM refinement failed, using raw input:', error.message);
        return cleanupEntry(rawInput);
    }
}

/**
 * Basic cleanup without LLM
 * @param {string} input - Raw input
 * @returns {string} Cleaned input
 */
function cleanupEntry(input) {
    return input
        .trim()
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .replace(/^[-•*]\s*/gm, '')  // Remove existing bullets
        .split(/[,;](?!\s*\d)/)  // Split on commas/semicolons (not within numbers)
        .map(s => s.trim())
        .filter(s => s)
        .join('\n• ');
}

/**
 * Generate a weekly summary from entries
 * @param {Array} entries - Array of {date, text} entries
 * @param {string} dateRange - Formatted date range string
 * @returns {string} Weekly summary
 */
async function generateWeeklySummary(entries, dateRange) {
    if (!entries || entries.length === 0) {
        return `📊 *Your Week (${dateRange})*\n\nNo entries yet! Start logging your work by sending me a DM.`;
    }

    // If no Gemini, generate basic summary
    if (!process.env.GEMINI_API_KEY) {
        return generateBasicSummary(entries, dateRange);
    }

    try {
        const client = getClient();
        const model = client.getGenerativeModel({ model: 'gemini-flash-latest' });

        const entriesText = entries.map(e =>
            `- ${e.date.toDateString()}: ${e.text}`
        ).join('\n');

        const prompt = `Summarize this week's work log for a personal review. Keep it casual and useful.

Entries:
${entriesText}

Create a brief summary with:
1. A header with the date range: ${dateRange}
2. Key wins (2-3 bullet points of the most notable work)
3. What took most of your time (1 sentence)

Keep it short and personal. Use emojis sparingly. Plain text only, no markdown asterisks.`;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error('Weekly summary generation failed:', error.message);
        return generateBasicSummary(entries, dateRange);
    }
}

/**
 * Generate basic summary without LLM
 * @param {Array} entries - Entries array
 * @param {string} dateRange - Date range string
 * @returns {string} Basic summary
 */
function generateBasicSummary(entries, dateRange) {
    const summary = [`📊 **Your Week in Review (${dateRange})**\n`];

    summary.push(`🎯 **Entries Logged:** ${entries.length}\n`);

    // Group by date
    const byDate = {};
    for (const entry of entries) {
        const dateKey = entry.date.toDateString();
        if (!byDate[dateKey]) {
            byDate[dateKey] = [];
        }
        byDate[dateKey].push(entry.text);
    }

    summary.push(`📅 **Active Days:** ${Object.keys(byDate).length}\n`);

    summary.push(`\n**Recent Entries:**`);
    const recentEntries = entries.slice(-5);
    for (const entry of recentEntries) {
        summary.push(`• ${entry.text}`);
    }

    return summary.join('\n');
}

/**
 * Transcribe audio file to text using Gemini
 * @param {Object} audioFile - Slack audio file object
 * @param {Object} client - Slack client for downloading
 * @returns {string|null} Transcribed text or null
 */
async function transcribeAudio(audioFile, client) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY required for audio transcription');
    }

    try {
        // Download the audio file from Slack
        const response = await fetch(audioFile.url_private_download, {
            headers: {
                'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to download audio: ${response.status}`);
        }

        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString('base64');

        // Determine mime type
        let mimeType = audioFile.mimetype || 'audio/webm';
        if (audioFile.filetype === 'webm') mimeType = 'audio/webm';
        if (audioFile.filetype === 'm4a') mimeType = 'audio/mp4';
        if (audioFile.filetype === 'mp4') mimeType = 'audio/mp4';

        // Use Gemini to transcribe
        const genAI = getClient();
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

        const result = await model.generateContent([
            {
                inlineData: {
                    data: base64Audio,
                    mimeType: mimeType,
                },
            },
            'Transcribe this audio message. Output only the transcribed text, nothing else. If you cannot understand the audio, say "Could not transcribe".',
        ]);

        const transcription = result.response.text().trim();

        if (transcription.toLowerCase().includes('could not transcribe')) {
            return null;
        }

        return transcription;
    } catch (error) {
        console.error('Transcription error:', error.message);
        throw error;
    }
}

module.exports = {
    refineEntry,
    generateWeeklySummary,
    cleanupEntry,
    transcribeAudio,
};
