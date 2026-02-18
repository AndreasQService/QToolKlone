# Supabase Setup Guide

To enable cloud synchronization for your Q-Service app, follow these steps to set up Supabase.

## 1. Create a Project
1. Go to [supabase.com](https://supabase.com) and sign up/log in.
2. Click **"New Project"**.
3. Name it `Start QService` (or similar).
4. Set a database password (save it somewhere safe).
5. Choose a region close to you (e.g., Frankfurt for Switzerland context).
6. Click **"Create new project"**.

## 2. Set Up the Database
Once the project is ready (takes ~2 minutes):
1. Go to the **SQL Editor** (icon on the left sidebar).
2. Click **"New Query"**.
3. Paste and run the following SQL code:

```sql
-- Create the reports table
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  content JSONB NOT NULL
);

-- Enable Row Level Security (RLS) is good practice, but for this prototype 
-- without user login, we will DISABLE it to allow access.
-- WARNING: This means anyone with your API keys can read/write data.
ALTER TABLE reports DISABLE ROW LEVEL SECURITY;
```

## 3. Gets Your API Keys
1. Go to **Project Settings** (cog icon) -> **API**.
2. Find the **Project URL** and **anon public** key.

## 4. Connect Your App
1. Open the file `.env.local` in your project folder.
2. Replace the placeholders with your actual keys:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. Restart your development server (`Ctrl+C` then `npm run dev`) to load the new variables.

## Done!
Your app will now automatically:
- Fetch reports from the database when you open it.
- Save reports to the database whenever you click "Speichern".
- Keep working offline using local storage if the network is down (and sync when you reload online).
