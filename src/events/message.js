/**
 * DM Message Event Handler
 * Captures DMs and logs them to the user's Google Doc
 */

const { getUser, updateStreak } = require('../db/firestore');
const { appendEntry } = require('../services/google-docs');
const { refineEntry, transcribeAudio } = require('../services/llm');

// In-memory cache to prevent duplicate message processing
const processedMessages = new Set();
const MESSAGE_CACHE_TTL = 60000; // 1 minute

/**
 * Register the message event handler
 * @param {App} app - Bolt app instance
 */
function register(app) {
    // Listen for DM messages
    app.message(async ({ message, client, say }) => {
        // Only handle DMs (channel type 'im')
        if (message.channel_type !== 'im') {
            return;
        }

        // Ignore bot messages and message edits
        if (message.bot_id || message.subtype) {
            return;
        }

        // Deduplicate: Check if we've already processed this message
        const messageKey = `${message.channel}:${message.ts}`;
        if (processedMessages.has(messageKey)) {
            console.log(`Skipping duplicate message: ${messageKey}`);
            return;
        }
        processedMessages.add(messageKey);

        // Clean up old entries after TTL
        setTimeout(() => processedMessages.delete(messageKey), MESSAGE_CACHE_TTL);

        const userId = message.user;
        let text = message.text || '';

        // Debug: Log message structure to understand what we're receiving
        console.log('Message received:', {
            hasFiles: !!message.files,
            fileCount: message.files?.length || 0,
            files: message.files?.map(f => ({
                mimetype: f.mimetype,
                filetype: f.filetype,
                name: f.name
            }))
        });

        // Check for audio/voice files
        if (message.files && message.files.length > 0) {
            const audioFile = message.files.find(f =>
                f.mimetype?.startsWith('audio/') ||
                f.filetype === 'webm' ||
                f.filetype === 'mp4' ||
                f.filetype === 'm4a'
            );

            if (audioFile) {
                console.log('Audio file detected:', audioFile.name, audioFile.mimetype);
                try {
                    // Download and transcribe the audio
                    const transcription = await transcribeAudio(audioFile, client);
                    if (transcription) {
                        text = transcription;
                        // Let the user know we transcribed their voice note
                        console.log(`Transcribed voice note: ${transcription.substring(0, 50)}...`);
                    }
                } catch (error) {
                    console.error('Audio transcription failed:', error.message);
                    await say('🎤 I couldn\'t transcribe your voice note. Please try typing your update instead.');
                    return;
                }
            }
        }

        // Skip if no text content
        if (!text || text.trim() === '') {
            return;
        }

        // Get the team ID from the message context
        // In DMs, we need to look this up or use a default
        let teamId;
        try {
            const authResult = await client.auth.test();
            teamId = authResult.team_id;
        } catch (error) {
            console.error('Failed to get team ID:', error);
            await say('❌ Something went wrong. Please try again.');
            return;
        }

        try {
            // Get user data
            const user = await getUser(teamId, userId);

            if (!user || !user.google_doc_id) {
                await say({
                    text: 'Setup required',
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '👋 Hey! I\'d love to log that for you, but you haven\'t set up your check-in doc yet.',
                            },
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: 'Run `/checkin setup` in any channel to connect your Google account and create your log.',
                            },
                        },
                    ],
                });
                return;
            }

            // Check if refresh token exists
            if (!user.google_refresh_token) {
                await say('🔄 Your Google connection expired. Please run `/checkin setup` to reconnect.');
                return;
            }

            // React to show we're processing (optional, may fail without reactions:write scope)
            try {
                await client.reactions.add({
                    channel: message.channel,
                    timestamp: message.ts,
                    name: 'hourglass_flowing_sand',
                });
            } catch (e) {
                // Ignore reaction errors (missing scope, already reacted, etc.)
            }

            // Check if user wants LLM enhancement (prefix with +)
            let entryText = text;
            let wasEnhanced = false;
            if (text.startsWith('+')) {
                entryText = await refineEntry(text.substring(1).trim());
                wasEnhanced = true;
            }

            // Append to Google Doc
            await appendEntry(
                user.google_refresh_token,
                user.google_doc_id,
                entryText,
                user.timezone || 'America/New_York'
            );

            // Update user streak
            const streak = await updateStreak(teamId, userId, user.timezone || 'America/New_York');

            // Remove processing reaction, add success (optional)
            try {
                await client.reactions.remove({
                    channel: message.channel,
                    timestamp: message.ts,
                    name: 'hourglass_flowing_sand',
                });
            } catch (e) {
                // Ignore
            }

            try {
                await client.reactions.add({
                    channel: message.channel,
                    timestamp: message.ts,
                    name: 'white_check_mark',
                });
            } catch (e) {
                // Ignore
            }

            // Send confirmation
            if (wasEnhanced) {
                await say({
                    text: `Logged (enhanced): ${entryText}`,
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `✨ *Logged (enhanced):*\n• ${entryText}`,
                            },
                        },
                        {
                            type: 'context',
                            elements: [
                                {
                                    type: 'mrkdwn',
                                    text: `<https://docs.google.com/document/d/${user.google_doc_id}/edit|View your log>`,
                                },
                            ],
                        },
                    ],
                });
            } else {
                await say({
                    text: `Logged: ${entryText}`,
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `✅ *Logged:* ${entryText}`,
                            },
                        },
                        {
                            type: 'context',
                            elements: [
                                {
                                    type: 'mrkdwn',
                                    text: `<https://docs.google.com/document/d/${user.google_doc_id}/edit|View your log> • Tip: Start with \`+\` to enhance with AI`,
                                },
                            ],
                        },
                    ],
                });
            }
        } catch (error) {
            console.error('Failed to log entry:', error);

            // Try to remove processing reaction
            try {
                await client.reactions.remove({
                    channel: message.channel,
                    timestamp: message.ts,
                    name: 'hourglass_flowing_sand',
                });
            } catch (e) {
                // Ignore if reaction doesn't exist
            }

            // Check for specific errors
            if (error.message?.includes('invalid_grant') || error.message?.includes('Token')) {
                await say('🔄 Your Google connection expired. Please run `/checkin setup` to reconnect.');
            } else {
                await say('❌ Failed to log your entry. Please try again in a moment.');
            }
        }
    });
}

module.exports = { register };
