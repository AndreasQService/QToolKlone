-- Create the table for storing damage reports
create table if not exists damage_reports (
  id text primary key, -- We use the Project Title as ID (e.g., "P-2026-02-1001")
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Metadata columns for easy filtering/sorting
  project_title text,
  client text,
  address text,
  status text,
  assigned_to text,
  date date,
  drying_started timestamp with time zone,
  
  -- The full report data as JSON (rooms, equipment, contacts, etc.)
  report_data jsonb,
  
  -- Array of image metadata (paths in storage bucket)
  image_urls jsonb
);

-- Enable Row Level Security (RLS)
alter table damage_reports enable row level security;

-- Create a policy that allows all operations for public/anon for now (since we don't have auth)
-- IN PRODUCTION: You should restrict this to authenticated users only!
create policy "Enable all access for anon" on damage_reports
  for all using (true) with check (true);

-- Create a bucket for storing images
insert into storage.buckets (id, name, public) 
values ('damage-images', 'damage-images', true)
on conflict (id) do nothing;

-- Allow public access to the bucket
create policy "Public Access to Images" on storage.objects
  for select using ( bucket_id = 'damage-images' );

create policy "Allow Uploads for Anon" on storage.objects
  for insert with check ( bucket_id = 'damage-images' );
