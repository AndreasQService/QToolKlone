
import { createClient } from '@supabase/supabase-js'

// HINWEIS: Ersetzen Sie die folgenden Zeilen mit Ihren echten Supabase-Daten, damit die App überall läuft.
const supabaseUrl = 'https://yxdoecdqttgdncgbzyus.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZG9lY2RxdHRnZG5jZ2J6eXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTE3OTIsImV4cCI6MjA4NjA4Nzc5Mn0.Jfl_mC9qzR06IaUL6fcD4sYWMoQP83ugVmKUG7r9VrQ';

// Create a single supabase client for interacting with your database
export const supabase = (supabaseUrl && supabaseKey && supabaseUrl !== 'IHRE_SUPABASE_URL_HIER_EINFÜGEN')
    ? createClient(supabaseUrl, supabaseKey)
    : null
