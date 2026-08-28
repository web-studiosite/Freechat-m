import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://geigdzmvhcvbxsbhgvvj.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlaWdkem12aGN2YnhzYmhndnZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDE1NjIsImV4cCI6MjEwMzUxNzU2Mn0.OLZAA_Ru1OVizUrlxDF6vdJN9RK-vNqBjZdidcTjvzE";

export function isConfigured(){
  return SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("COLE_AQUI") &&
    SUPABASE_ANON_KEY.length > 30 &&
    !SUPABASE_ANON_KEY.includes("COLE_AQUI");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
