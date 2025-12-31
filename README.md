# Daily Check-in Bot 📝

A Slack bot that captures your daily work updates via DM and logs them to a Google Doc you own. Keep a running record of your accomplishments with zero friction.

---

## ✨ Features

### 📝 Instant Logging
Just DM the bot - your message is logged immediately.
```
You: Fixed the login bug
Bot: ✅ Logged: Fixed the login bug
```

### 🤖 AI Enhancement (Optional)
Start with `+` to clean up grammar and formatting:
```
You: +fixed bug, spent 2 hours debugging
Bot: ✨ Logged (enhanced): Fixed bug, spent 2 hours debugging
```

### 📅 Smart Organization
Entries automatically grouped by day with proper headings:
```
Tuesday, December 31st, 2024
• Fixed login bug
• Reviewed PR #123
• Started dashboard redesign
```

### 🔥 Streak Tracking
Stay motivated with daily streaks:
- 📝 Just started (1-2 days)
- ⭐ Building momentum (3-6 days)
- 🔥 On fire! (7+ days)

### 🔍 Search Your History
Find past entries instantly:
```
/checkin search meeting
→ Found 5 entries containing "meeting"
```

### ⏰ Daily Reminders
Get a gentle nudge at your preferred time:
```
/checkin reminder 5pm
```

### 🎤 Voice Notes
Send an audio message - automatically transcribed and logged.

### 📊 Weekly Summaries
AI-generated recap of your week:
```
/checkin weekly
→ 📊 Your Week (Dec 23-30): Fixed 3 bugs, completed auth refactor...
```

---

## 🎮 Commands

| Command | Description |
|---------|-------------|
| `/checkin setup` | Connect Google account & create doc |
| `/checkin status` | View your streak & stats |
| `/checkin weekly` | Get AI weekly summary |
| `/checkin undo` | Remove last entry |
| `/checkin search <keyword>` | Search your entries |
| `/checkin reminder <time>` | Set reminder (e.g., `5pm`, `17:00`, `off`) |
| `/checkin help` | Show all commands |

---

## 🔒 Privacy & Security

- **You own your data**: Docs live in YOUR Google Drive, owned by YOU
- **Per-user isolation**: App uses YOUR credentials to access YOUR doc only
- **Minimal scope**: `drive.file` means the app can't see your other Drive files
- **Encrypted storage**: All OAuth tokens encrypted with AES-256-GCM
- **No admin access**: App developers cannot see users' docs or entries

---

## 💰 Cost

**Free** for personal use:
- Runs on Google Cloud free tier
- Uses Gemini API free tier for AI features

---

## 📖 Documentation

- **[Setup Guide](docs/SETUP.md)** - Installation & configuration
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Multi-workspace distribution
- **[Architecture](docs/ARCHITECTURE.md)** - Technical deep-dive

---

## 🚀 Quick Start

See the [Setup Guide](docs/SETUP.md) for full instructions.

```bash
git clone https://github.com/your-username/daily-checkin.git
cd daily-checkin
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

---

## License

ISC
