-- ====================================================================
-- AGRITECH PRO: SCHEMA SYNC & FEATURE PATCH
-- ====================================================================
-- Run this in the Supabase SQL Editor to align your database with
-- the Finance Pro, Labor Pro, and Audit modules.

-- 1. AUDIT TRAIL INFRASTRUCTURE
CREATE TABLE IF NOT EXISTS public.audit_trail (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    action_type TEXT NOT NULL, -- e.g., 'DELETE_REQUEST', 'DELETE_APPROVED'
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL, -- Stored as text to support mixed ID types
    record_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on audit_trail
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Audit Write" ON public.audit_trail;
CREATE POLICY "Public Audit Write" ON public.audit_trail FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Super User Read" ON public.audit_trail;
CREATE POLICY "Super User Read" ON public.audit_trail FOR SELECT USING (true); -- Restricted by role in app logic

-- 2. UNIVERSAL FEATURE COLUMNS (Test Mode & Auditing)
-- This logic adds columns safely only if they don't already exist.
DO $$
DECLARE
    t text;
    target_tables text[] := ARRAY['expenses', 'production', 'partner_transactions', 'inventory', 'attendance', 'cashflow'];
BEGIN
    FOREACH t IN ARRAY target_tables LOOP
        -- Add is_dev_test
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'is_dev_test') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN is_dev_test BOOLEAN DEFAULT FALSE', t);
        END IF;

        -- Add auditing columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'is_delete_pending') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN is_delete_pending BOOLEAN DEFAULT FALSE', t);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'delete_requested_by') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN delete_requested_by TEXT', t);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'delete_requested_at') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN delete_requested_at TIMESTAMPTZ', t);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'deleted_at') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN deleted_at TIMESTAMPTZ', t);
        END IF;
    END LOOP;
END $$;

-- 3. ATTENDANCE SCHEMA SPECIFICS
-- Some versions of the attendance table may be missing clock-in/out fields.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance' AND column_name = 'check_in') THEN
        ALTER TABLE public.attendance ADD COLUMN check_in TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance' AND column_name = 'check_out') THEN
        ALTER TABLE public.attendance ADD COLUMN check_out TEXT;
    END IF;
END $$;

-- 4. CASHFLOW SCHEMA SPECIFICS (Consistency)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cashflow' AND column_name = 'type') THEN
        ALTER TABLE public.cashflow ADD COLUMN type TEXT; -- Inflow / Outflow
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cashflow' AND column_name = 'amount') THEN
        ALTER TABLE public.cashflow ADD COLUMN amount DECIMAL(12,2) DEFAULT 0;
    END IF;
END $$;

-- 5. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
