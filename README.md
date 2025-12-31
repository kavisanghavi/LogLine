# Daily Check-in Bot

A Slack bot that captures your daily work updates via DM and logs them to a Google Doc you own. Features LLM-powered input refinement and weekly summaries.

## Features

- 📝 **DM Logging**: Send a message to the bot and it's automatically logged
- 🤖 **LLM Refinement**: Cleans up your input into professional bullet points
- 📅 **Date-Based Grouping**: Entries organized by day
- 📊 **Weekly Summaries**: AI-generated weekly recap
- 🔒 **Secure**: OAuth tokens encrypted at rest, `drive.file` scope only

## Quick Start

### 1. Prerequisites

- Node.js 24+ (run `nvm use` to use the project's version)
- A Slack workspace where you can install apps
- Google Cloud project with Docs API enabled

### 2. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create new app from scratch
3. Add these OAuth scopes under "Bot Token Scopes":
   - `chat:write`
   - `commands`
   - `im:history`
   - `users:read`
4. Create a slash command `/checkin`
5. Enable Event Subscriptions and subscribe to `message.im`
6. Install to workspace

### 3. Create Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project
3. Enable "Google Docs API" and "Google Drive API"
4. Create OAuth 2.0 credentials (Web application)
5. Add redirect URI: `http://localhost:3000/oauth/google/callback`

### 4. Set Up Firestore

1. In Google Cloud Console, go to Firestore
2. Create a database (Native mode)
3. Set up Application Default Credentials:
   ```bash
   gcloud auth application-default login
   ```

### 5. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Generate an encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6. Run the Bot

```bash
# Install dependencies
npm install

# Development (with hot reload)
npm run dev

# Production
npm start
```

## Commands

| Command | Description |
|---------|-------------|
| `/checkin setup` | Connect Google account & create doc |
| `/checkin status` | Check your connection |
| `/checkin weekly` | Get weekly summary |
| `/checkin undo` | Remove last entry |
| `/checkin help` | Show help |

**To log an entry**: Just DM the bot with your update!

## Project Structure

```
src/
├── app.js              # Main entry point
├── commands/
│   └── checkin.js      # /checkin command handler
├── events/
│   └── message.js      # DM message handler
├── services/
│   ├── google-docs.js  # Google Docs API
│   ├── llm.js          # Gemini integration
│   └── oauth.js        # Google OAuth
├── db/
│   ├── encryption.js   # Token encryption
│   └── firestore.js    # Database client
└── utils/
    └── date-formatter.js
```

## License

ISC
