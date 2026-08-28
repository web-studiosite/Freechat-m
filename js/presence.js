import { supabase } from "./supabase.js";
import { me } from "./auth.js";

const HEARTBEAT_MS = 20000;
const STALE_MS = 65000;

export async function startPresence(){
  const user = await me();
  if (!user) return null;

  const heartbeat = async () => {
    const { error } = await supabase.from("profiles").update({
      online: true,
      last_seen: new Date().toISOString()
    }).eq("id", user.id);
    if (error) console.warn("Heartbeat:", error.message);
  };

  await heartbeat();
  const timer = setInterval(heartbeat, HEARTBEAT_MS);

  const markOffline = () => {
    // Best effort. The last_seen timeout is the real source of truth.
    supabase.from("profiles").update({ online: false, last_seen: new Date().toISOString() }).eq("id", user.id);
  };
  window.addEventListener("pagehide", markOffline, { once: true });

  return { user, stop: () => { clearInterval(timer); markOffline(); } };
}

export const ONLINE_WINDOW_MS = STALE_MS;
