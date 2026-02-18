-- Migration: Setup tables for File Upload & Extraction

-----------------------------------------------------------
-- 1. Create BUCKET for case files
-----------------------------------------------------------
-- Note: You might need to run this in the Supabase SQL Editor manually if the API doesn't allow bucket creation via SQL depending on permissions.
insert into storage.buckets (id, name, public)
values ('case-files', 'case-files', true)
on conflict (id) do nothing;

-- Policies for case-files Bucket
-- DROP existing policies to be safe/clean
drop policy if exists "Public Access to Case Files" on storage.objects;
drop policy if exists "Allow Uploads for Anon to Case Files" on storage.objects;
drop policy if exists "Allow Update/Delete for Anon to Case Files" on storage.objects;
drop policy if exists "Authenticated Access to Case Files" on storage.objects;
drop policy if exists "Allow Uploads for Authenticated to Case Files" on storage.objects;
drop policy if exists "Allow Update/Delete for Authenticated to Case Files" on storage.objects;
drop policy if exists "Allow Delete for Authenticated to Case Files" on storage.objects;


-- Create policies for AUTHENTICATED users
create policy "Authenticated Access to Case Files" on storage.objects
  for select using ( bucket_id = 'case-files' and auth.role() = 'authenticated' );

create policy "Allow Uploads for Authenticated to Case Files" on storage.objects
  for insert with check ( bucket_id = 'case-files' and auth.role() = 'authenticated' );

create policy "Allow Update/Delete for Authenticated to Case Files" on storage.objects
  for update using ( bucket_id = 'case-files' and auth.role() = 'authenticated' );
  
-- Also add delete policy
create policy "Allow Delete for Authenticated to Case Files" on storage.objects
  for delete using ( bucket_id = 'case-files' and auth.role() = 'authenticated' );


-----------------------------------------------------------
-- 2. Create TABLE: case_documents
-- Tracks the uploaded files and their processing status
-----------------------------------------------------------
create table if not exists case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  file_path text not null,
  file_type text not null check (file_type in ('pdf','msg')),
  original_filename text,
  extraction_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_case_documents_case_id
  on case_documents(case_id);

-- RLS
alter table case_documents enable row level security;

-- Drop old policies if they exist
drop policy if exists "Enable all access for anon" on case_documents;
drop policy if exists "Enable all access for authenticated" on case_documents;

-- Create policies for AUTHENTICATED users
create policy "Enable all access for authenticated" on case_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');


-----------------------------------------------------------
-- 3. Create TABLE: case_extractions
-- Stores the raw AI extracted JSON before it's merged into the main report
-----------------------------------------------------------
create table if not exists case_extractions (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  json_result jsonb not null,
  confidence jsonb,
  evidence jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_case_extractions_case_id
  on case_extractions(case_id);

-- RLS
alter table case_extractions enable row level security;

-- Drop old policies if they exist
drop policy if exists "Enable all access for anon" on case_extractions;
drop policy if exists "Enable all access for authenticated" on case_extractions;

-- Create policies for AUTHENTICATED users
create policy "Enable all access for authenticated" on case_extractions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');


-----------------------------------------------------------
-- 4. (Optional) Database Webhook Trigger
-- If you want the Edge Function to run automatically on INSERT
-- You need to enable webhooks in Supabase Dashboard -> Database -> Webhooks
-- URL: https://<project-ref>.functions.supabase.co/extract
-----------------------------------------------------------
