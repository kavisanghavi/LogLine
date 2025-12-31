# Setup Guide

Complete instructions for setting up the Daily Check-in Bot locally and in production.

---

## Prerequisites

- Node.js 20+ (use `nvm use` in project directory)
- A Slack workspace where you can install apps
- Google Cloud project

---

## 1. Clone the Repository

```bash
git clone https://github.com/your-username/daily-checkin.git
cd daily-checkin
npm install
```

---

## 2. Create Slack App

### Option A: Use Manifest (Recommended)

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From a manifest**
3. Select your workspace
4. Paste the contents of `slack-app-manifest.yaml`
5. Click **Create**
6. Install to your workspace

### Option B: Manual Setup

1. Create a new app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add these **Bot Token Scopes**:
   - `chat:write`
   - `commands`
   - `im:history`
   - `im:read`
   - `im:write`
   - `reactions:write`
   - `users:read`
3. Create slash command `/checkin` pointing to your URL
4. Enable Event Subscriptions and subscribe to `message.im`
5. Install to workspace

### Get Your Credentials

From your Slack app settings, copy:
- **Bot User OAuth Token** (`xoxb-...`)
- **Signing Secret**

---

## 3. Set Up Google Cloud

### Create Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g., `daily-checkin`)
3. Note the **Project ID**

### Enable APIs

Enable these APIs:
- Google Docs API
- Google Drive API

### Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Choose **Web application**
4. Add authorized redirect URI:
   - Development: `http://localhost:3000/oauth/google/callback`
   - Production: `https://your-app.run.app/oauth/google/callback`
5. Copy **Client ID** and **Client Secret**

### Set Up Firestore

1. Go to **Firestore** in Cloud Console
2. Create database in **Native mode**
3. Choose a region (e.g., `us-central1`)

### Configure Local Auth

```bash
gcloud auth application-default login
```

---

## 4. Get Gemini API Key

1. Go to [makersuite.google.com](https://makersuite.google.com/app/apikey)
2. Create an API key
3. Copy it for your `.env`

---

## 5. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Slack
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-signing-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google/callback

# Google Cloud
GOOGLE_CLOUD_PROJECT=your-project-id

# Gemini
GEMINI_API_KEY=your-gemini-key

# Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=your-64-char-hex-key
```

Generate an encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 6. Start ngrok (Development)

For local development, you need a public URL:

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and update:

1. **Slack App** → Slash Commands → Request URL: `https://abc123.ngrok.io/slack/events`
2. **Slack App** → Event Subscriptions → Request URL: `https://abc123.ngrok.io/slack/events`

---

## 7. Run the Bot

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

---

## 8. Test It

1. Go to Slack and DM the bot
2. Run `/checkin setup` to connect Google
3. Send a message to log your first entry!

---

## Production Deployment (Cloud Run)

### Build and Deploy

```bash
gcloud run deploy daily-checkin \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=your-project-id"
```

### Set Secrets

Store sensitive values as secrets:

```bash
# Create secrets
echo -n "your-value" | gcloud secrets create SLACK_BOT_TOKEN --data-file=-
echo -n "your-value" | gcloud secrets create ENCRYPTION_KEY --data-file=-

# Mount in Cloud Run
gcloud run services update daily-checkin \
  --update-secrets=SLACK_BOT_TOKEN=SLACK_BOT_TOKEN:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest
```

### Update URLs

Update your Slack app with the Cloud Run URL:
- Slash Command: `https://your-app-xyz.run.app/slack/events`
- Event Subscriptions: `https://your-app-xyz.run.app/slack/events`

Also update Google OAuth redirect URI.

---

## Set Up Daily Reminders (Optional)

Create a Cloud Scheduler job to trigger reminders:

```bash
gcloud scheduler jobs create http daily-reminder \
  --schedule="*/5 * * * *" \
  --uri="https://your-app.run.app/api/trigger-reminders" \
  --http-method=POST \
  --headers="Authorization=Bearer your-secret"
```

Add `REMINDER_SECRET` to your environment to secure the endpoint.

---

## Troubleshooting

### "Missing scope" errors
Reinstall your Slack app after adding new scopes.

### Firestore "NOT_FOUND" error
Make sure your database ID matches in `src/db/firestore.js`.

### Gemini API errors
Check your API key is valid and you have quota remaining.

### OAuth redirect errors
Verify your redirect URI matches exactly in Google Console and `.env`.
