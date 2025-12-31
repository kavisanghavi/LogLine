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

        const parts = command.text.trim().split(' ');
        const subcommand = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

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
            case 'search':
                await handleSearch(command, respond, args);
                break;
            case 'reminder':
                await handleReminder(command, respond, args);
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
        const streak = user.current_streak || 0;
        const longestStreak = user.longest_streak || 0;
        const streakEmoji = streak >= 7 ? '🔥' : streak >= 3 ? '⭐' : '📝';

        await respond({
            text: 'Daily Check-ins Status',
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `✅ *Daily Check-ins Active*\n\n📄 *Document:* <${docUrl}|Open your log>\n${streakEmoji} *Current Streak:* ${streak} day${streak !== 1 ? 's' : ''}\n🏆 *Longest Streak:* ${longestStreak} day${longestStreak !== 1 ? 's' : ''}\n🕐 *Reminder:* ${user.reminder_time || '17:00'}\n🌍 *Timezone:* ${user.timezone || 'America/New_York'}`,
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
                    text: '`/checkin setup` - Connect Google & create your log\n`/checkin status` - View your stats and streak\n`/checkin weekly` - Get your weekly summary\n`/checkin undo` - Remove your last entry\n`/checkin search <keyword>` - Search your entries\n`/checkin reminder <time>` - Set reminder time (e.g. 5pm)\n`/checkin help` - Show this message\n\n*To log:* DM me! Start with `+` for AI cleanup.',
                },
            },
        ],
        response_type: 'ephemeral',
    });
}

/**
 * Handle /checkin search
 */
async function handleSearch(command, respond, keyword) {
    const { getUser } = require('../db/firestore');
    const { getDocContent, extractTextContent } = require('../services/google-docs');

    if (!keyword || keyword.trim() === '') {
        await respond({
            text: '❌ Please provide a search term: `/checkin search <keyword>`',
            response_type: 'ephemeral',
        });
        return;
    }

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
            text: `🔍 Searching for "${keyword}"...`,
            response_type: 'ephemeral',
        });

        const doc = await getDocContent(user.google_refresh_token, user.google_doc_id);
        const text = extractTextContent(doc);
        const lines = text.split('\n');

        const matches = [];
        let currentDate = null;

        for (const line of lines) {
            // Check for date headings
            const dateMatch = line.match(/^(##?\s+)?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+)\s+(\d+)/);
            if (dateMatch) {
                currentDate = line.replace(/^##?\s+/, '').trim();
                continue;
            }

            // Check if this bullet contains the keyword
            if (line.trim().startsWith('•') && line.toLowerCase().includes(keyword.toLowerCase())) {
                matches.push({
                    date: currentDate || 'Unknown date',
                    text: line.trim().substring(1).trim(),
                });
            }
        }

        if (matches.length === 0) {
            await respond({
                text: `🔍 No entries found for "${keyword}"`,
                response_type: 'ephemeral',
            });
            return;
        }

        const resultText = matches.slice(0, 10).map(m =>
            `• *${m.date}*: ${m.text}`
        ).join('\n');

        await respond({
            text: `Found ${matches.length} entries for "${keyword}"`,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `🔍 *Found ${matches.length} entries for "${keyword}":*\n\n${resultText}${matches.length > 10 ? `\n\n...and ${matches.length - 10} more` : ''}`,
                    },
                },
            ],
            response_type: 'ephemeral',
        });
    } catch (error) {
        console.error('Search failed:', error);
        await respond({
            text: '❌ Error searching entries. Please try again.',
            response_type: 'ephemeral',
        });
    }
}

/**
 * Handle /checkin reminder
 */
async function handleReminder(command, respond, timeArg) {
    const { getUser, saveUser } = require('../db/firestore');

    if (!timeArg || timeArg.trim() === '') {
        await respond({
            text: '❌ Please provide a time: `/checkin reminder 5pm` or `/checkin reminder 17:00` or `/checkin reminder off`',
            response_type: 'ephemeral',
        });
        return;
    }

    try {
        const user = await getUser(command.team_id, command.user_id);

        if (!user || !user.google_doc_id) {
            await respond({
                text: '❌ You haven\'t set up Daily Check-ins yet. Run `/checkin setup` to get started!',
                response_type: 'ephemeral',
            });
            return;
        }

        // Parse time argument
        let reminderTime = null;
        const input = timeArg.toLowerCase().trim();

        if (input === 'off' || input === 'disable' || input === 'none') {
            reminderTime = null;
        } else {
            // Try to parse time like "5pm", "17:00", "5:30pm"
            const match12hr = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
            const match24hr = input.match(/^(\d{1,2}):(\d{2})$/);

            if (match12hr) {
                let hours = parseInt(match12hr[1]);
                const minutes = match12hr[2] ? parseInt(match12hr[2]) : 0;
                const period = match12hr[3].toLowerCase();

                if (period === 'pm' && hours < 12) hours += 12;
                if (period === 'am' && hours === 12) hours = 0;

                reminderTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            } else if (match24hr) {
                const hours = parseInt(match24hr[1]);
                const minutes = parseInt(match24hr[2]);
                if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                    reminderTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                }
            }

            if (!reminderTime) {
                await respond({
                    text: `❌ Couldn't parse "${timeArg}". Try \`/checkin reminder 5pm\` or \`/checkin reminder 17:00\``,
                    response_type: 'ephemeral',
                });
                return;
            }
        }

        // Update user reminder time
        await saveUser({
            teamId: command.team_id,
            userId: command.user_id,
            reminderTime: reminderTime || 'off',
        });

        if (reminderTime) {
            await respond({
                text: `⏰ Reminder set for ${reminderTime} daily. I'll ping you to log your work!`,
                response_type: 'ephemeral',
            });
        } else {
            await respond({
                text: '🔕 Daily reminder disabled.',
                response_type: 'ephemeral',
            });
        }
    } catch (error) {
        console.error('Reminder update failed:', error);
        await respond({
            text: '❌ Error updating reminder. Please try again.',
            response_type: 'ephemeral',
        });
    }
}

module.exports = { register };
