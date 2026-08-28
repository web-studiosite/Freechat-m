import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "COLE_AQUI_A_URL_DO_SEU_PROJETO";
export const SUPABASE_ANON_KEY = "COLE_AQUI_A_CHAVE_PUBLICA_ANON";

export function isConfigured(){
  return SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("COLE_AQUI") &&
    SUPABASE_ANON_KEY.length > 30 &&
    !SUPABASE_ANON_KEY.includes("COLE_AQUI");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
