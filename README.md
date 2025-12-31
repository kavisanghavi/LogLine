# Daily Check-in Bot 📝

A Slack bot that captures your daily work updates via DM and logs them to a Google Doc you own.

## Features

- **📝 DM Logging**: Send a message to the bot → instantly logged
- **✨ Optional AI Enhancement**: Start with `+` to clean up grammar
- **📅 Date-Based Grouping**: Entries organized by day with proper headings
- **📊 Weekly Summaries**: `/checkin weekly` for AI-generated recaps
- **🔙 Undo**: `/checkin undo` to remove the last entry
- **🔒 Secure**: Tokens encrypted at rest, minimal OAuth scopes

---

## Quick Start

### Prerequisites

- Node.js 20+ (`nvm use` to use project version)
- Slack workspace with admin access
- Google Cloud project

### 1. Clone & Install

```bash
git clone https://github.com/your-username/daily-checkin.git
cd daily-checkin
npm install
```

### 2. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App**
2. Choose **From a manifest** → paste contents of `slack-app-manifest.yaml`
3. Install to your workspace
4. Copy **Bot Token** and **Signing Secret** to `.env`

### 3. Set Up Google Cloud

1. Create project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Google Docs API** and **Google Drive API**
3. Create **OAuth 2.0 credentials** (Web application type)
4. Add redirect URI: `http://localhost:3000/oauth/google/callback`
5. Copy Client ID and Secret to `.env`

### 4. Set Up Firestore

```bash
# Enable Firestore in your GCP project, then:
gcloud auth application-default login
```

### 5. Configure Environment

```bash
cp .env.example .env
```

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6. Start ngrok (for local development)

```bash
ngrok http 3000
```

Copy the HTTPS URL and update your Slack app's:
- **Slash Commands URL**: `https://xxxx.ngrok.io/slack/events`
- **Event Subscriptions URL**: `https://xxxx.ngrok.io/slack/events`

### 7. Run

```bash
npm run dev
```

---

## Usage

### Logging Entries

Just DM the bot:
```
Fixed the login bug
```

With AI cleanup (prefix with `+`):
```
+fixed login bug, took 2 hours
```

### Commands

| Command | Description |
|---------|-------------|
| `/checkin setup` | Connect Google account & create doc |
| `/checkin status` | Check your connection |
| `/checkin weekly` | Get AI weekly summary |
| `/checkin undo` | Remove last entry |
| `/checkin help` | Show help |

---

## Multi-Workspace Deployment

To let others install your app:

### 1. Enable Distribution

1. Slack App Dashboard → **Manage Distribution**
2. Complete all checklist items
3. **Activate Public Distribution**

### 2. Deploy to Cloud Run

```bash
# Build & deploy
gcloud run deploy daily-checkin \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### 3. Update URLs

Replace `localhost:3000` with your Cloud Run URL in:
- Slack App settings (slash command, events)
- Google OAuth redirect URI

---

## Security

- **Encryption**: All tokens encrypted with AES-256-GCM before storage
- **Minimal Scopes**: 
  - Google: `drive.file` (only app-created files)
  - Slack: No access to channels, just DMs
- **User Ownership**: Docs are owned by users, not the app

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full security model.

---

## Project Structure

```
src/
├── app.js              # Main entry, Express routes
├── commands/
│   └── checkin.js      # /checkin handlers
├── events/
│   └── message.js      # DM handler
├── services/
│   ├── google-docs.js  # Doc operations
│   ├── llm.js          # Gemini API
│   └── oauth.js        # Google OAuth
├── db/
│   ├── encryption.js   # AES-256-GCM
│   └── firestore.js    # Database
└── utils/
    └── date-formatter.js
```

---

## Cost

**$0/month** on free tier:
- Cloud Run: 2M requests free
- Firestore: 50K reads/day free
- Gemini: 15 RPM free

---

## License

ISC
