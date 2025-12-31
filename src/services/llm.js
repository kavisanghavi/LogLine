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

        const prompt = `You are helping someone write their personal work journal. Clean up this quick note into a clear, natural-sounding entry.

Rules:
- Keep it casual and personal, like you're writing for yourself
- Plain text only, no markdown or formatting
- Keep the same level of detail as the input (don't trim long entries)
- Start with an action verb (past tense)
- If numbers or metrics are mentioned, ALWAYS include them
- Don't add corporate jargon, keep it natural
- Preserve the original meaning and important details

Examples:
- "fixed 3 bugs" → "Fixed 3 bugs in the login flow"
- "meeting with design" → "Had a sync with the design team"
- "spent 2 hours debugging the api issue, turns out it was a caching problem" → "Spent 2 hours debugging the API issue - turned out to be a caching problem"

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
        return `📊 **Your Week in Review (${dateRange})**\n\nNo entries found for this week. Start logging your work!`;
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

        const prompt = `Analyze these work log entries and create a concise weekly summary.

Entries:
${entriesText}

Create a summary with:
1. 📊 Week header with date range: ${dateRange}
2. 🎯 Key Accomplishments (2-4 bullet points of the most impactful work)
3. 📈 Themes (categorize what percentage of work fell into what categories)

Keep it brief and actionable. Use emojis sparingly. Output as plain text with markdown formatting.`;

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

module.exports = {
    refineEntry,
    generateWeeklySummary,
    cleanupEntry,
};
