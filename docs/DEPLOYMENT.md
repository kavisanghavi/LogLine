# Deployment Guide (Multi-Workspace)

This guide covers how to deploy the Daily Check-in Bot to a production environment (Google Cloud Run) and enable it for multiple Slack workspaces.

---

## 🏗️ Architecture Summary

- **App Engine**: Google Cloud Run (Serverless, auto-scaling)
- **Database**: Firestore (Multi-team installations & user tokens)
- **Security**: AES-256-GCM encryption for all tokens
- **Auth**: Slack OAuth 2.0 (Workspace install) + Google OAuth 2.0 (User doc access)

---

## 0. Prerequisite: App Credentials

You'll need these values from your app dashboards:

### Slack Dashboard
Go to **Basic Information** → **App Credentials**:
- `SLACK_CLIENT_ID`: Available here
- `SLACK_CLIENT_SECRET`: Available here
- `SLACK_SIGNING_SECRET`: Available here
- `SLACK_STATE_SECRET`: Any random string you generate (e.g., `openssl rand -hex 32`)

### Google Cloud Console
Go to **APIs & Services** → **Credentials**:
- `GOOGLE_CLIENT_ID`: From your OAuth 2.0 Client ID
- `GOOGLE_CLIENT_SECRET`: From your OAuth 2.0 Client ID

---

## 1. Prepare Your Slack App for Distribution
...
---

## 2. Google Cloud Infrastructure Setup

### Firestore
Ensure Firestore is enabled in **Native Mode**. The bot uses a collection named `installations` for Slack workspaces and `users` for individual users.

### Secret Manager: Bulk Creation with `sync-secrets.sh`
Instead of creating secrets one-by-one, you can use the provided script to bulk-upload your `.env` values to Google Secret Manager.

```bash
# Run the sync script from the project root
./sync-secrets.sh
```

This script will read your `.env` file, create each variable as a Secret in your GCP project, and upload the values securely.

---

## 3. Recommended Deployment Order

To avoid circular dependencies (needing the URL to set the redirect URL), follow this order:

1. **First Deploy**: Deploy to Cloud Run with placeholder environment variables just to get your **Service URL**.
   ```bash
   gcloud run deploy daily-checkin --source . --region us-central1 --allow-unauthenticated
   ```
2. **Update Dashboards**: Use the new Service URL (e.g., `https://daily-checkin-xyz.a.run.app`) to update:
   - **Slack**: Event Subscription URL (`/slack/events`) and Redirect URL (`/slack/oauth_redirect`).
   - **Google Console**: OAuth Redirect URI (`/oauth/google/callback`).
3. **Final Deploy/Update**: Update your Cloud Run service with the correct environment variables or link them to the secrets you created in Step 2.

```bash
gcloud run services update daily-checkin \
  --set-env-vars "GOOGLE_REDIRECT_URI=https://your-app.run.app/oauth/google/callback" \
  --update-secrets=SLACK_BOT_TOKEN=SLACK_BOT_TOKEN:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest \
  # ... add other secrets/vars
```

---

## 4. Multi-Workspace Installation Flow

Once deployed, users can install the app from your landing page:

1. Direct users to `https://your-app.run.app/install`.
2. They click the **Add to Slack** button.
3. They authorize the app in their workspace.
4. The bot is now installed in that team.
5. Users in that team can run `/checkin setup` to link their Google account.

---

## 5. Daily Reminders (Cloud Scheduler)

To send daily reminders at the specified times, set up a Cloud Scheduler job.

```bash
gcloud scheduler jobs create http daily-checkin-reminders \
  --schedule="*/5 * * * *" \
  --uri="https://your-app.run.app/api/trigger-reminders" \
  --http-method=POST \
  --headers="Authorization=Bearer your-reminder-secret" \
  --location=us-central1
```

*Note: The script checks each user's preferred time and timezone, so running every 5 minutes ensures timely delivery.*

---

## 🛡️ Security Checklist for Production

- [ ] **Encryption Key**: Ensure `ENCRYPTION_KEY` is a strong, 32-byte hex string.
- [ ] **HTTPS**: Cloud Run provides this automatically. Never use HTTP for callbacks.
- [ ] **OAuth Scopes**: Periodically review scopes to ensure "Principle of Least Privilege".
- [ ] **Firestore Rules**: Use IAM roles to restrict Firestore access to the Cloud Run service account only.

---

## 📈 Monitoring & Logs

View real-time logs in the Google Cloud Console:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=daily-checkin" --limit 50
```
