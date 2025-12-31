# Deployment Notes

## Voice Note Transcription (Experimental)

**Status:** Partially implemented, requires additional Slack configuration.

**Current Issue:** Slack's `message.im` event doesn't include file attachments by default. To enable voice transcription:

1. Add the `file_shared` event subscription to your Slack app
2. Subscribe to bot events: `file_shared`
3. Handle file_shared events separately in the app

**Alternative:** For now, voice transcription can be skipped. Users can type their updates instead.

**Implementation:** The transcription code is ready in `src/services/llm.js` using Gemini's free multimodal API.

---

## Production Deployment Checklist

- [x] All environment variables in Secret Manager
- [x] Cloud Run deployed and running
- [x] Slack OAuth configured with Client ID/Secret
- [x] Google OAuth configured with redirect URI
- [x] Multi-workspace support enabled
- [x] `/install` landing page live
- [ ] Voice notes (experimental - requires file_shared event)
- [ ] Cloud Scheduler for daily reminders (optional)

---

## Service URL
https://daily-checkin-80224894314.us-central1.run.app

## Next Steps
1. Test all commands in Slack workspace
2. Set up Cloud Scheduler for daily reminders (optional)
3. Enable file_shared event for voice notes (optional)
