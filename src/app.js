/**
 * Daily Check-in Bot
 * Main application entry point
 */

require('dotenv').config();

const { App, ExpressReceiver } = require('@slack/bolt');
const express = require('express');

// Create Express receiver for custom routes
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true,
});

// Initialize Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  // For Socket Mode (optional, for development)
  // socketMode: true,
  // appToken: process.env.SLACK_APP_TOKEN,
});

// Access Express app for custom routes
const expressApp = receiver.app;

// Middleware for JSON parsing
expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));

// =============================================================================
// Register Slack handlers
// =============================================================================

// Commands
const checkinCommand = require('./commands/checkin');
checkinCommand.register(app);

// Events (DM messages)
const messageEvent = require('./events/message');
messageEvent.register(app);

// =============================================================================
// OAuth Callback Route (for Google OAuth)
// =============================================================================

const { getTokensFromCode } = require('./services/oauth');
const { createCheckinDoc } = require('./services/google-docs');
const { saveUser } = require('./db/firestore');

expressApp.get('/oauth/google/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  let stateData;
  try {
    stateData = JSON.parse(state);
  } catch (error) {
    return res.status(400).send('Invalid state parameter');
  }

  const { userId, teamId } = stateData;

  try {
    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);

    if (!tokens.refresh_token) {
      return res.status(400).send(
        'No refresh token received. Please try again and make sure to grant offline access.'
      );
    }

    // Get user info from Slack (including timezone)
    let userName = 'User';
    let timezone = 'America/New_York';
    try {
      const userInfo = await app.client.users.info({ user: userId });
      userName = userInfo.user.real_name || userInfo.user.name || 'User';
      timezone = userInfo.user.tz || 'America/New_York';
    } catch (error) {
      console.error('Failed to get user info:', error.message);
    }

    // Create a new Google Doc
    const doc = await createCheckinDoc(tokens.refresh_token, userName);

    // Save user data (including timezone)
    await saveUser({
      teamId,
      userId,
      googleRefreshToken: tokens.refresh_token,
      googleDocId: doc.docId,
      timezone,
    });

    // Notify user in Slack
    try {
      await app.client.chat.postMessage({
        channel: userId,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🎉 *You\'re all set!*\n\nYour Daily Check-in doc has been created.',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📄 *Your document:* <${doc.docUrl}|${doc.title}>`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*How to use:*\nJust send me a DM with what you worked on, and I\'ll add it to your log!',
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Try `/checkin status` to see your connection details.',
              },
            ],
          },
        ],
      });
    } catch (error) {
      console.error('Failed to send success message:', error.message);
    }

    // Send success HTML
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Setup Complete</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .card {
              background: white;
              padding: 3rem;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 400px;
            }
            h1 { color: #1a1a2e; margin-bottom: 1rem; }
            p { color: #4a4a6a; line-height: 1.6; }
            .emoji { font-size: 4rem; margin-bottom: 1rem; }
            a {
              display: inline-block;
              margin-top: 1.5rem;
              padding: 0.75rem 1.5rem;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
            }
            a:hover { background: #5a6fd6; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="emoji">🎉</div>
            <h1>Setup Complete!</h1>
            <p>Your Daily Check-in doc has been created. You can close this window and return to Slack.</p>
            <a href="${doc.docUrl}" target="_blank">Open Your Doc →</a>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Setup Failed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #fee;
            }
            .card {
              background: white;
              padding: 2rem;
              border-radius: 16px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.1);
              text-align: center;
            }
            h1 { color: #c00; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>❌ Setup Failed</h1>
            <p>Please try running <code>/checkin setup</code> again.</p>
            <p>Error: ${error.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

// Health check endpoint
expressApp.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =============================================================================
// Daily Reminder Trigger (Called by Cloud Scheduler)
// =============================================================================

const { getAllUsersForReminders } = require('./db/firestore');

expressApp.post('/api/trigger-reminders', async (req, res) => {
  // Verify request is from Cloud Scheduler (optional: add auth header check)
  const authHeader = req.headers.authorization;
  if (process.env.REMINDER_SECRET && authHeader !== `Bearer ${process.env.REMINDER_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const users = await getAllUsersForReminders();
    const now = new Date();
    let sent = 0;

    for (const user of users) {
      // Skip users with reminders disabled
      if (!user.reminder_time || user.reminder_time === 'off') continue;

      // Check if it's the right time in user's timezone
      const userTime = now.toLocaleTimeString('en-US', {
        timeZone: user.timezone || 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      // Allow 5-minute window for scheduler timing
      const [targetHour, targetMin] = user.reminder_time.split(':').map(Number);
      const [currentHour, currentMin] = userTime.split(':').map(Number);

      const targetMinutes = targetHour * 60 + targetMin;
      const currentMinutes = currentHour * 60 + currentMin;

      if (Math.abs(targetMinutes - currentMinutes) > 5) continue;

      // Check if user already logged today
      if (user.last_log_at) {
        const lastLog = user.last_log_at.toDate ? user.last_log_at.toDate() : new Date(user.last_log_at);
        const lastLogDate = lastLog.toLocaleDateString('en-US', { timeZone: user.timezone || 'America/New_York' });
        const todayDate = now.toLocaleDateString('en-US', { timeZone: user.timezone || 'America/New_York' });

        if (lastLogDate === todayDate) continue; // Already logged today
      }

      // Send reminder
      try {
        await app.client.chat.postMessage({
          channel: user.slack_user_id,
          text: '👋 Hey! What did you work on today?',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `👋 *Daily Check-in Reminder*\n\nWhat did you work on today? Just reply to this message to log it!`,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: user.current_streak ? `🔥 Current streak: ${user.current_streak} days` : 'Start your streak today!',
                },
              ],
            },
          ],
        });
        sent++;
      } catch (error) {
        console.error(`Failed to send reminder to ${user.slack_user_id}:`, error.message);
      }
    }

    res.json({ success: true, reminders_sent: sent });
  } catch (error) {
    console.error('Reminder trigger failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// Start the app
// =============================================================================

const PORT = process.env.PORT || 3000;

(async () => {
  await app.start(PORT);
  console.log(`⚡️ Daily Check-in bot is running on port ${PORT}`);
  console.log(`🔗 OAuth callback: http://localhost:${PORT}/oauth/google/callback`);
})();
