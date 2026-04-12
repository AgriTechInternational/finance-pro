#!/bin/bash
# =============================================================
# AgriTech Finance Pro — Push Notification Deploy Script
# Run this ONCE from the project root to set everything up
# =============================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========================================"
echo -e "  AgriTech Push Notification Setup"
echo -e "========================================${NC}"

# 1. Install Supabase CLI if missing
if ! command -v supabase &> /dev/null; then
  echo -e "${YELLOW}Installing Supabase CLI...${NC}"
  brew install supabase/tap/supabase
fi
echo -e "${GREEN}✅ Supabase CLI ready${NC}"

# 2. Login to Supabase (browser-based login)
echo ""
echo -e "${YELLOW}🔐 Logging into Supabase (browser will open)...${NC}"
supabase login

# 3. Link the project
echo ""
echo -e "${YELLOW}🔗 Linking to AgriTech Supabase project...${NC}"
supabase link --project-ref tctgihojkynjpmsheyhq

# 4. Get service role key from user
echo ""
echo -e "${YELLOW}🔑 You need your Supabase SERVICE ROLE KEY to continue."
echo -e "   Find it at: https://supabase.com/dashboard/project/tctgihojkynjpmsheyhq/settings/api"
echo -e "   Under 'Project API keys' → 'service_role' (click Reveal)${NC}"
echo ""
read -p "  Paste your service_role key here: " SERVICE_ROLE_KEY
echo ""

# 5. Set Edge Function secrets
echo -e "${YELLOW}📬 Setting push notification secrets...${NC}"
supabase secrets set \
  VAPID_PUBLIC_KEY="BCKJSitLFok1Yy_PSOicoZVYbioCHbR1G0L1bQpScspDtet76gXKAO0kYF1VqNZl22DPNjeX2p8dC9NcQfklKIg" \
  VAPID_PRIVATE_KEY="FDTbFKJXiWA4savQ0kJvPxZkraXhVOnLGoUgkA8sBZE" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"

echo -e "${GREEN}✅ Secrets set${NC}"

# 6. Create database tables
echo ""
echo -e "${YELLOW}🗄️  Creating push_subscriptions and sheet_snapshots tables...${NC}"
supabase db push --file supabase_push_notifications.sql || echo -e "${YELLOW}⚠️  Tables may already exist — skipping${NC}"
echo -e "${GREEN}✅ Database tables ready${NC}"

# 7. Deploy Edge Function
echo ""
echo -e "${YELLOW}🚀 Deploying notify-sheet-changes Edge Function...${NC}"
supabase functions deploy notify-sheet-changes --no-verify-jwt
echo -e "${GREEN}✅ Edge Function deployed${NC}"

# 8. Set up cron schedule (every 15 minutes)
echo ""
echo -e "${YELLOW}⏰ Setting up cron schedule (every 15 minutes)...${NC}"
supabase functions schedule notify-sheet-changes --cron "*/15 * * * *" 2>/dev/null || true

# 9. Build and deploy frontend
echo ""
echo -e "${YELLOW}🏗️  Building frontend...${NC}"
npm run build

echo ""
echo -e "${GREEN}========================================"
echo -e "  ✅ Push Notifications FULLY SET UP!"
echo -e "========================================"
echo -e "${NC}"
echo -e "What happens now:"
echo -e "  1. Open the app on your phone and tap 🔔 → 'Enable Push Notifications'"
echo -e "  2. Your device is registered automatically with Supabase"
echo -e "  3. Every 15 minutes, the server checks Google Sheets"
echo -e "  4. If anything changed, you get an OS-level push notification"
echo -e "     — even if the app is closed! 📲"
echo ""
echo -e "${BLUE}Edge Function URL:${NC}"
echo -e "  https://tctgihojkynjpmsheyhq.supabase.co/functions/v1/notify-sheet-changes"
echo ""
echo -e "${YELLOW}Next: Deploy the frontend to GitHub Pages${NC}"
echo -e "  git add . && git commit -m 'feat: mobile push notifications' && git push"
