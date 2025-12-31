/**
 * /checkin setup Command
 * Initiates Google OAuth flow and creates a new doc
 */

const { getAuthUrl } = require('../services/oauth');

/**
 * Register the setup command
 * @param {App} app - Bolt app instance
 */
function register(app) {
    app.command('/checkin', async ({ command, ack, respond, client }) => {
        await ack();

        const subcommand = command.text.trim().split(' ')[0].toLowerCase();

        // Route to appropriate handler
        switch (subcommand) {
            case 'setup':
                await handleSetup(command, respond, client);
                break;
            case 'status':
                await handleStatus(command, respond);
                break;
            case 'weekly':
                await handleWeekly(command, respond);
                break;
            case 'undo':
                await handleUndo(command, respond);
                break;
            case 'help':
            case '':
                await handleHelp(respond);
                break;
            default:
                await respond({
                    text: `Unknown command: \`${subcommand}\`. Try \`/checkin help\` for available commands.`,
                    response_type: 'ephemeral',
                });
        }
    });
}

/**
 * Handle /checkin setup
 */
async function handleSetup(command, respond, client) {
    const state = JSON.stringify({
        userId: command.user_id,
        teamId: command.team_id,
        channelId: command.channel_id,
    });

    const authUrl = getAuthUrl(state);

    await respond({
        text: 'Set up Daily Check-ins',
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '🚀 *Set up Daily Check-ins*\n\nConnect your Google account to create a new document for your daily logs.',
                },
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: '🔗 Connect Google Account',
                            emoji: true,
                        },
                        url: authUrl,
                        style: 'primary',
                    },
                ],
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: '🔒 We only access documents created by this app. Your data stays yours.',
                    },
                ],
            },
        ],
        response_type: 'ephemeral',
    });
}

/**
 * Handle /checkin status
 */
async function handleStatus(command, respond) {
    const { getUser } = require('../db/firestore');

    try {
        const user = await getUser(command.team_id, command.user_id);

        if (!user || !user.google_doc_id) {
            await respond({
                text: '❌ You haven\'t set up Daily Check-ins yet. Run `/checkin setup` to get started!',
                response_type: 'ephemeral',
            });
            return;
        }

        const docUrl = `https://docs.google.com/document/d/${user.google_doc_id}/edit`;

        await respond({
            text: 'Daily Check-ins Status',
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `✅ *Daily Check-ins Active*\n\n📄 *Document:* <${docUrl}|Open your log>\n🕐 *Reminder:* ${user.reminder_time || '17:00'}\n🌍 *Timezone:* ${user.timezone || 'America/New_York'}`,
                    },
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: 'DM me anytime to log an entry!',
                        },
                    ],
                },
            ],
            response_type: 'ephemeral',
        });
    } catch (error) {
        console.error('Status check failed:', error);
        await respond({
            text: '❌ Error checking status. Please try again.',
            response_type: 'ephemeral',
        });
    }
}

/**
 * Handle /checkin weekly
 */
async function handleWeekly(command, respond) {
    const { getUser } = require('../db/firestore');
    const { getEntriesForDateRange } = require('../services/google-docs');
    const { generateWeeklySummary } = require('../services/llm');
    const { getWeekStart, getWeekEnd, formatDateRange } = require('../utils/date-formatter');

    try {
        const user = await getUser(command.team_id, command.user_id);

        if (!user || !user.google_doc_id) {
            await respond({
                text: '❌ You haven\'t set up Daily Check-ins yet. Run `/checkin setup` to get started!',
                response_type: 'ephemeral',
            });
            return;
        }

        await respond({
            text: '⏳ Generating your weekly summary...',
            response_type: 'ephemeral',
        });

        const weekStart = getWeekStart();
        const weekEnd = getWeekEnd();
        const dateRange = formatDateRange(weekStart, weekEnd);

        const entries = await getEntriesForDateRange(
            user.google_refresh_token,
            user.google_doc_id,
            weekStart,
            weekEnd
        );

        const summary = await generateWeeklySummary(entries, dateRange);

        await respond({
            text: summary,
            response_type: 'ephemeral',
        });
    } catch (error) {
        console.error('Weekly summary failed:', error);
        await respond({
            text: '❌ Error generating summary. Please try again.',
            response_type: 'ephemeral',
        });
    }
}

/**
 * Handle /checkin undo
 */
async function handleUndo(command, respond) {
    const { getUser } = require('../db/firestore');
    const { removeLastEntry } = require('../services/google-docs');

    try {
        const user = await getUser(command.team_id, command.user_id);

        if (!user || !user.google_doc_id) {
            await respond({
                text: '❌ You haven\'t set up Daily Check-ins yet. Run `/checkin setup` to get started!',
                response_type: 'ephemeral',
            });
            return;
        }

        const removed = await removeLastEntry(
            user.google_refresh_token,
            user.google_doc_id
        );

        if (!removed) {
            await respond({
                text: '🤷 No entries found to remove.',
                response_type: 'ephemeral',
            });
            return;
        }

        await respond({
            text: `🗑️ Removed: "${removed.text}"`,
            response_type: 'ephemeral',
        });
    } catch (error) {
        console.error('Undo failed:', error);
        await respond({
            text: '❌ Error removing entry. Please try again.',
            response_type: 'ephemeral',
        });
    }
}

/**
 * Handle /checkin help
 */
async function handleHelp(respond) {
    await respond({
        text: 'Daily Check-in Help',
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*📝 Daily Check-in Commands*',
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '`/checkin setup` - Connect Google & create your log doc\n`/checkin status` - Check your connection status\n`/checkin weekly` - Get your weekly summary\n`/checkin undo` - Remove your last entry\n`/checkin help` - Show this help message\n\n*To log an entry:* Just DM me with your update!',
                },
            },
        ],
        response_type: 'ephemeral',
    });
}

module.exports = { register };
