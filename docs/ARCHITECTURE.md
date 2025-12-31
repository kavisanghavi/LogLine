# Daily Check-in Tool - Architecture & Implementation Plan

A Slack-to-Google Docs productivity tool with **LLM-powered refinement** that captures daily work logs via DM and syncs them to user-owned Google Docs.

---

## Overview

This system enables users to:
1. Send a DM to a Slack bot with their daily work
2. LLM refines and structures the input
3. Entry is appended to a Google Doc they own
4. Get daily reminders and weekly summaries

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Runtime** | Node.js 20 | Slack Bolt SDK is best-in-class |
| **Framework** | Bolt for JavaScript | Official Slack SDK |
| **Database** | Firestore | Serverless, auto-scales, free tier |
| **Hosting** | Google Cloud Run | Serverless, free tier generous |
| **LLM** | Gemini API | Free tier, GCP native |
| **Scheduler** | Cloud Scheduler | Daily reminders |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Slack                                │
│  ┌──────────┐    ┌──────────────────┐                       │
│  │   User   │───▶│  Check-in Bot    │                       │
│  └──────────┘    └────────┬─────────┘                       │
└───────────────────────────┼─────────────────────────────────┘
                            │ Events/Commands
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Google Cloud                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Cloud Run                           │   │
│  │  ┌─────────┐  ┌───────────┐  ┌──────────────────┐   │   │
│  │  │  Bolt   │  │  OAuth    │  │   Doc Service    │   │   │
│  │  │  App    │  │  Handler  │  │   (append/read)  │   │   │
│  │  └─────────┘  └───────────┘  └──────────────────┘   │   │
│  │       │              │               │               │   │
│  │       │              │               │               │   │
│  │  ┌────▼──────────────▼───────────────▼────────────┐ │   │
│  │  │              Gemini API (LLM)                   │ │   │
│  │  │         - Refine user input                     │ │   │
│  │  │         - Generate weekly summaries             │ │   │
│  │  └────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │  Firestore   │   │   Secret     │   │    Cloud     │    │
│  │  (tokens,    │   │   Manager    │   │   Scheduler  │    │
│  │   doc IDs)   │   │  (enc keys)  │   │  (reminders) │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Google Workspace                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Google Docs API                     │   │
│  │         (User-owned doc with drive.file scope)        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Users Collection (Firestore)

```javascript
{
  // Document ID: {team_id}:{user_id}
  slack_user_id: "U12345",
  slack_team_id: "T67890",
  google_refresh_token: "encrypted:...",  // AES-256-GCM
  google_doc_id: "1abc...",
  timezone: "America/New_York",
  reminder_time: "17:00",
  created_at: Timestamp,
  last_log_at: Timestamp
}
```

### Installations Collection (Firestore)

```javascript
{
  // Document ID: team_id
  slack_bot_token: "encrypted:...",
  slack_bot_id: "B12345",
  installed_at: Timestamp
}
```

---

## OAuth Flow

### Token Refresh (Automatic)

Users authenticate **once**. After that:

1. User DMs the bot
2. App retrieves encrypted `refresh_token` from Firestore
3. App calls Google to exchange `refresh_token` for `access_token`
4. App uses `access_token` to write to Doc
5. **User never re-authenticates unless they revoke access**

---

## Features

| Feature | Trigger | Description |
|---------|---------|-------------|
| Setup | `/checkin setup` | OAuth → Creates doc in user's Drive |
| Log | DM to bot | LLM refines → appends to Doc |
| Status | `/checkin status` | Shows doc link, connection health |
| Reminder | Daily (5 PM) | "What did you accomplish today?" |
| Weekly | `/checkin weekly` | LLM-generated week summary |
| Undo | `/checkin undo` | Removes last entry |

---

## Google Doc Format

```markdown
# Daily Check-ins

## Monday, December 30th, 2025
• Fixed mobile login bug
• Reviewed Jane's PR for auth refactor
• Started work on dashboard redesign

## Sunday, December 29th, 2025
• Set up development environment
• Completed onboarding tasks
```

---

## Security

### Token Encryption

All OAuth tokens encrypted at rest:
- Algorithm: AES-256-GCM
- Master key: Stored in Google Secret Manager
- Per-token IV: Stored alongside encrypted token

### OAuth Scopes (Minimal)

| Platform | Scope | Purpose |
|----------|-------|---------|
| Google | `drive.file` | Only docs created by app |
| Google | `documents` | Read/write doc content |
| Slack | `chat:write`, `commands`, `im:history` | DMs and commands |

---

## Cost (5-10 Users)

**$0/month** — All within free tiers:
- Cloud Run: 2M requests/month free
- Firestore: 50K reads/day free
- Gemini: 15 requests/minute free
- Cloud Scheduler: 3 jobs free

---

## Project Structure

```
daily-checkin/
├── docs/
│   └── ARCHITECTURE.md
├── src/
│   ├── app.js
│   ├── commands/
│   │   ├── setup.js
│   │   ├── status.js
│   │   ├── weekly.js
│   │   └── undo.js
│   ├── events/
│   │   └── message.js
│   ├── services/
│   │   ├── google-docs.js
│   │   ├── llm.js
│   │   └── oauth.js
│   └── db/
│       ├── firestore.js
│       └── encryption.js
├── package.json
└── README.md
```

---

## Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. Foundation | 3-4 days | Cloud Run + Firestore + Bolt |
| 2. OAuth | 3-4 days | Google auth + doc creation |
| 3. Logging | 3-4 days | DM handling + Gemini + Doc append |
| 4. Reminders | 2-3 days | Scheduler + weekly summary |
| 5. Polish | 2-3 days | Undo, error handling, tests |

**Total: ~2-3 weeks**
