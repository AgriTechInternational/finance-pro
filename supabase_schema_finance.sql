-- AgriTech Pro: Finance Schema (PostgreSQL)

-- 1. General Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE,
    category TEXT NOT NULL, -- 'Electricity', 'Rent', 'Daily', etc.
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Partner Transactions (Wageh, Tharwat, Elwady, etc.)
CREATE TABLE IF NOT EXISTS public.partner_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    partner_name TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    type TEXT NOT NULL, -- 'Credit', 'Debit'
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Material Inventory
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE,
    item_name TEXT NOT NULL,
    quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
    unit TEXT, -- 'kg', 'bags', 'tons'
    type TEXT NOT NULL, -- 'IN', 'OUT'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Cash Flow
CREATE TABLE IF NOT EXISTS public.cashflow (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE,
    description TEXT,
    inflow DECIMAL(12,2) DEFAULT 0,
    outflow DECIMAL(12,2) DEFAULT 0,
    balance DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses, public.partner_transactions, public.inventory, public.cashflow;

-- RLS Policies (Public for Migration)
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public finance 1" ON public.expenses FOR ALL USING (true);
CREATE POLICY "Allow public finance 2" ON public.partner_transactions FOR ALL USING (true);
CREATE POLICY "Allow public finance 3" ON public.inventory FOR ALL USING (true);
CREATE POLICY "Allow public finance 4" ON public.cashflow FOR ALL USING (true);
