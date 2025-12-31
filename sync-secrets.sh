#!/bin/bash

# =============================================================================
# Daily Check-in Bot - Secret Sync Script
# Syncs .env variables to Google Cloud Secret Manager
# =============================================================================

# Set project ID if not provided
PROJECT_ID=$(grep GOOGLE_CLOUD_PROJECT .env | cut -d '=' -f2)

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: GOOGLE_CLOUD_PROJECT not found in .env"
  exit 1
fi

echo "🚀 Syncing secrets to project: $PROJECT_ID"

success_count=0
fail_count=0

while IFS='=' read -r key value || [ -n "$key" ]; do
  # Skip comments and empty lines
  [[ $key =~ ^#.* ]] || [ -z "$key" ] && continue
  
  # Trim potential quotes and whitespace
  key=$(echo $key | xargs)
  value=$(echo $value | xargs)
  
  echo "📤 Syncing $key..."
  
  # Create secret if it doesn't exist
  gcloud secrets create "$key" --replication-policy="automatic" --project="$PROJECT_ID" 2>/dev/null || true
  
  # Add new version
  if echo -n "$value" | gcloud secrets versions add "$key" --data-file=- --project="$PROJECT_ID" > /dev/null 2>&1; then
    echo "✅ $key synced"
    ((success_count++))
  else
    echo "❌ Failed to sync $key. Is the Secret Manager API enabled?"
    echo "   Run: gcloud services enable secretmanager.googleapis.com"
    ((fail_count++))
  fi
done < .env

echo "---"
echo "✨ Sync Summary: $success_count successful, $fail_count failed."

if [ $fail_count -gt 0 ]; then
  echo "⚠️ Some secrets failed to sync. Check the errors above."
  exit 1
fi

echo "Next step: Run 'gcloud run deploy' and link these secrets."
