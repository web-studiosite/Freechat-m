import { supabase } from "./supabase.js";

export async function ensureSession(){
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Sessão:", error);
    return null;
  }
  if (data.session) return data.session;

  const { data: signed, error: signError } = await supabase.auth.signInAnonymously();
  if (signError) {
    console.error("Login anônimo:", signError);
    return null;
  }
  return signed.session;
}

export async function getProfile(userId){
  const { data, error } = await supabase
    .from("profiles")
    .select("id,nickname,avatar,online,available,last_seen,created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function me(){
  const session = await ensureSession();
  return session?.user || null;
}
