-- ============================================================
-- AgriTech Finance Pro — Push Notification Tables
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Push Subscriptions: stores each device's Web Push endpoint
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     TEXT,                          -- Supabase auth user ID (optional)
  endpoint    TEXT UNIQUE NOT NULL,          -- Push service URL (unique per device)
  p256dh      TEXT NOT NULL,                 -- Device public key
  auth        TEXT NOT NULL,                 -- Auth secret
  user_agent  TEXT,                          -- Browser/device info
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sheet Snapshots: stores last-known row counts for change detection
CREATE TABLE IF NOT EXISTS public.sheet_snapshots (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sheet_id    TEXT UNIQUE NOT NULL,          -- Google Sheets ID
  snapshot    JSONB NOT NULL DEFAULT '{}',   -- { "DailyProduction": 45, "Wageh": 12, ... }
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_snapshots    ENABLE ROW LEVEL SECURITY;

-- Allow the Edge Function (service role) full access
CREATE POLICY "service_role_push_subscriptions" ON public.push_subscriptions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_sheet_snapshots" ON public.sheet_snapshots
  FOR ALL USING (true) WITH CHECK (true);

-- Allow anonymous inserts for push subscriptions (so browsers can register)
CREATE POLICY "anon_insert_push_subscriptions" ON public.push_subscriptions
  FOR INSERT TO anon WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON public.push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS idx_sheet_snapshots_sheet_id   ON public.sheet_snapshots (sheet_id);

-- ============================================================
-- Done! You can now verify the tables by running:
-- SELECT * FROM push_subscriptions;
-- SELECT * FROM sheet_snapshots;
-- ============================================================
