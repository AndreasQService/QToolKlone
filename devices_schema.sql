
-- Table for Devices Inventory
create table if not exists devices (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Device specific fields
  number text, -- Inventory number (e.g. "101")
  type text,   -- e.g. "Kondenstrockner"
  model text,  -- e.g. "Trotec TTK 100"
  status text default 'Aktiv', -- "Aktiv", "Defekt", "Verfügbar"
  
  -- Tracking where it is currently deployed
  current_project text, -- Project Title or Client Name for display
  current_report_id text, -- Foreign Key to damage_reports.id (nullable)
  
  -- Energy Consumption
  energy_consumption numeric, -- e.g. 0.5 (kW)

  -- Unique constraint on number? Maybe.
  constraint unique_device_number unique (number)
);

-- Enable RLS
alter table devices enable row level security;

-- Policies for devices (Allow all for anon for now)
create policy "Enable all access for anon" on devices
  for all using (true) with check (true);

-- Migration existing data:
-- alter table devices add column if not exists energy_consumption numeric;
