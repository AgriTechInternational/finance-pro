-- AgriTech Pro: Cloud Sync Schema Update v2
-- This table stores the Google Sheet connections for each user.

CREATE TABLE IF NOT EXISTS public.sheet_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    sheet_id TEXT NOT NULL,
    label TEXT NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT false,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.sheet_configs ENABLE ROW LEVEL SECURITY;

-- Only Allow Owners to see their own connections
CREATE POLICY "Allow owners to manage their own configs" 
ON public.sheet_configs 
FOR ALL 
USING (auth.uid() = owner_id);

-- Add to Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sheet_configs;
