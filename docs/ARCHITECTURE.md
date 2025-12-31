# Daily Check-in Bot - Architecture & Security

A Slack-to-Google Docs productivity tool that captures daily work logs via DM and syncs them to user-owned Google Docs.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SLACK                                       │
│    ┌────────┐      ┌───────────────┐                                    │
│    │  User  │─────▶│ Daily Check-in│                                    │
│    │  DM    │      │     Bot       │                                    │
│    └────────┘      └───────┬───────┘                                    │
│                            │                                             │
│    Commands: /checkin [setup|status|weekly|undo|help]                   │
└────────────────────────────┼─────────────────────────────────────────────┘
                             │ HTTPS (Slack Events API)
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GOOGLE CLOUD                                     │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                       CLOUD RUN                                   │   │
│  │                                                                   │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │   │
│  │   │  Bolt SDK   │    │   OAuth     │    │   Google Docs       │ │   │
│  │   │  (Slack)    │───▶│   Handler   │───▶│   Service           │ │   │
│  │   └─────────────┘    └─────────────┘    └─────────────────────┘ │   │
│  │          │                                        │              │   │
│  │          ▼                                        ▼              │   │
│  │   ┌─────────────────────────────────────────────────┐           │   │
│  │   │            Gemini API (Optional)                 │           │   │
│  │   │   • Entry refinement (opt-in with + prefix)     │           │   │
│  │   │   • Weekly summary generation                    │           │   │
│  │   └─────────────────────────────────────────────────┘           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                             │                                            │
│         ┌───────────────────┼───────────────────┐                       │
│         ▼                   ▼                   ▼                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │  Firestore  │    │   Secret    │    │   Cloud     │                 │
│  │             │    │   Manager   │    │  Scheduler  │                 │
│  │ • User data │    │             │    │             │                 │
│  │ • Doc IDs   │    │ • Master    │    │ • Daily     │                 │
│  │ • Encrypted │    │   encrypt   │    │   reminders │                 │
│  │   tokens    │    │   key       │    │             │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼ OAuth 2.0 (user's credentials)
┌─────────────────────────────────────────────────────────────────────────┐
│                        GOOGLE WORKSPACE                                  │
│                                                                          │
│    User's Google Drive ─── Google Doc (owned by USER, not app)          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. User Sends DM → Entry Logged

```
User types "Fixed the login bug"
         │
         ▼
┌─────────────────────────────────────────────┐
│ 1. Slack sends message event to Cloud Run  │
│ 2. App looks up user in Firestore          │
│ 3. Decrypts Google refresh token           │
│ 4. Gets fresh access token from Google     │
│ 5. Appends entry to user's Google Doc      │
│ 6. Confirms back to user in Slack          │
└─────────────────────────────────────────────┘
```

### 2. Optional LLM Enhancement (+ prefix)

```
User types "+fixed bug"
         │
         ▼
┌─────────────────────────────────────────────┐
│ Same as above, but step 4 includes:        │
│ • Send text to Gemini API                  │
│ • Gemini returns: "Fixed bug"              │
│ • Cleaned text is appended to Doc          │
└─────────────────────────────────────────────┘
```

---

## Database Schema (Firestore)

### Collection: `users`

| Field | Type | Description |
|-------|------|-------------|
| Document ID | `{team_id}:{user_id}` | Composite key for multi-workspace |
| `slack_user_id` | string | Slack user ID |
| `slack_team_id` | string | Slack workspace ID |
| `google_refresh_token` | string | **Encrypted** OAuth refresh token |
| `google_doc_id` | string | User's Google Doc ID |
| `timezone` | string | User's timezone (from Slack) |
| `reminder_time` | string | Daily reminder time (HH:MM) |
| `created_at` | timestamp | Account creation time |
| `updated_at` | timestamp | Last update time |

### Collection: `installations`

| Field | Type | Description |
|-------|------|-------------|
| Document ID | `{team_id}` | Slack workspace ID |
| `slack_bot_token` | string | **Encrypted** bot token |
| `slack_bot_id` | string | Bot user ID |
| `installed_at` | timestamp | Installation time |

---

## Security Model

### Encryption at Rest

All sensitive tokens are encrypted using **AES-256-GCM** before storage:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENCRYPTION PROCESS                            │
│                                                                  │
│  plaintext_token ──▶ AES-256-GCM ──▶ encrypted_blob             │
│                         ▲                                        │
│                         │                                        │
│            ┌────────────┴────────────┐                          │
│            │     Master Key          │                          │
│            │  (Secret Manager or     │                          │
│            │   env var for dev)      │                          │
│            └─────────────────────────┘                          │
│                                                                  │
│  Stored in Firestore: "encrypted:{iv}:{authTag}:{ciphertext}"   │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**
- **IV (Initialization Vector)**: 12 bytes, unique per encryption
- **Auth Tag**: 16 bytes, ensures integrity
- **Ciphertext**: Encrypted token data

### Minimal OAuth Scopes

| Service | Scope | What It Allows |
|---------|-------|----------------|
| **Google** | `https://www.googleapis.com/auth/drive.file` | Access ONLY to files created by this app |
| **Google** | `https://www.googleapis.com/auth/documents` | Read/write Google Doc content |
| **Slack** | `chat:write` | Send messages as bot |
| **Slack** | `commands` | Handle slash commands |
| **Slack** | `im:history` | Read DMs sent to bot |
| **Slack** | `im:read` | Basic DM info |
| **Slack** | `im:write` | Send DMs |
| **Slack** | `reactions:write` | Add emoji reactions |
| **Slack** | `users:read` | Get user timezone |

### Key Security Properties

1. **User owns their data**: Google Docs are owned by the user, not the app
2. **Minimal access**: `drive.file` scope means app can't see other user files
3. **Encrypted tokens**: Even if Firestore is compromised, tokens are useless without master key
4. **Master key isolation**: Key stored in Secret Manager, separate from data
5. **No plaintext logging**: Tokens never logged in plaintext

---

## Multi-Workspace Deployment

To allow users from **other Slack workspaces** to install your app:

### Step 1: Enable OAuth Distribution

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Your App
2. **OAuth & Permissions** → Enable "Distribute App"
3. **Manage Distribution** → Activate Public Distribution

### Step 2: Add Install Button

Add this to your landing page:

```html
<a href="https://slack.com/oauth/v2/authorize?client_id=YOUR_CLIENT_ID&scope=chat:write,commands,im:history,im:read,im:write,reactions:write,users:read&redirect_uri=YOUR_REDIRECT_URI">
  <img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" />
</a>
```

### Step 3: Handle Slack OAuth Callback

Add a route to handle workspace installation (already in your app):

```javascript
// src/app.js - Add Slack OAuth endpoint
expressApp.get('/slack/oauth/callback', async (req, res) => {
    const { code } = req.query;
    const result = await app.client.oauth.v2.access({
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
    });
    // Save installation to Firestore
    await saveInstallation({
        teamId: result.team.id,
        botToken: result.access_token,
        botId: result.bot_user_id,
    });
    res.redirect('/installed');
});
```

### Step 4: Deploy to Cloud Run

```bash
# Build container
gcloud builds submit --tag gcr.io/YOUR_PROJECT/daily-checkin

# Deploy
gcloud run deploy daily-checkin \
  --image gcr.io/YOUR_PROJECT/daily-checkin \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=YOUR_PROJECT"
```

### Step 5: Update URLs

Update your Slack app settings with your Cloud Run URL:
- **Slash Command URL**: `https://your-app-xyz.run.app/slack/events`
- **Event Subscriptions URL**: `https://your-app-xyz.run.app/slack/events`
- **OAuth Redirect URL**: `https://your-app-xyz.run.app/slack/oauth/callback`
- **Google OAuth Redirect**: `https://your-app-xyz.run.app/oauth/google/callback`

---

## Cost Estimate (Free Tier)

| Service | Free Tier | Our Usage |
|---------|-----------|-----------|
| Cloud Run | 2M requests/month | ~5K requests/month |
| Firestore | 50K reads/day | ~100 reads/day |
| Secret Manager | 10K accesses/month | ~1K accesses/month |
| Gemini API | 15 RPM free | ~50 requests/day |
| **Total** | | **$0/month** |

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `/checkin setup` | Connect Google account, create doc |
| `/checkin status` | Show connection status and doc link |
| `/checkin weekly` | AI-generated weekly summary |
| `/checkin undo` | Remove last logged entry |
| `/checkin help` | Show help message |

**Logging entries:**
- Send any DM → Logged as-is
- Send DM starting with `+` → AI cleans up grammar

---

## Project Structure

```
daily-checkin/
├── src/
│   ├── app.js                 # Main entry point, Express routes
│   ├── commands/
│   │   └── checkin.js         # /checkin command handlers
│   ├── events/
│   │   └── message.js         # DM message handler
│   ├── services/
│   │   ├── google-docs.js     # Google Docs API operations
│   │   ├── llm.js             # Gemini API integration
│   │   └── oauth.js           # Google OAuth helpers
│   ├── db/
│   │   ├── firestore.js       # Database client
│   │   └── encryption.js      # AES-256-GCM encryption
│   └── utils/
│       ├── date-formatter.js  # Date heading utilities
│       └── diagnostics.js     # Debug/connectivity tests
├── docs/
│   └── ARCHITECTURE.md        # This file
├── slack-app-manifest.yaml    # Slack app configuration
├── package.json
├── .env.example
└── README.md
```
