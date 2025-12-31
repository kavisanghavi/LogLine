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
        const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `You are a work log assistant. Take this raw work update and refine it into clean, professional bullet points.

Rules:
- Keep it concise (one short sentence per bullet)
- Fix grammar and spelling
- Maintain the person's voice and meaning
- If there are multiple items, separate them with newlines
- Start each item with an action verb when possible
- Don't add any commentary, just output the refined text
- If it's already clean, output it as-is

Raw input: "${rawInput}"

Refined output:`;

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
        const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
