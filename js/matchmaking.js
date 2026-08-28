import { supabase } from "./supabase.js";
import { me, getProfile } from "./auth.js";
import { startPresence } from "./presence.js";

const user = await me();
if (!user) { location.href = "index.html"; throw new Error("Sem sessão"); }
await startPresence();
const p = await getProfile(user.id);
if (!p?.nickname) { location.href = "profile.html?setup=1"; throw new Error("Configure o perfil"); }
if (!p.available) { document.querySelector("#status").textContent = "Ative 'Estou disponível para conversar' no seu perfil."; throw new Error("Não disponível"); }

let cancelled = false;
const cancelButton = document.querySelector("#cancel");
const status = document.querySelector("#status");

cancelButton.addEventListener("click", async () => {
  cancelled = true;
  cancelButton.disabled = true;
  await supabase.rpc("cancel_waiting");
  location.href = "index.html";
});

async function find() {
  if (cancelled) return;
  const { data, error } = await supabase.rpc("find_random_match");
  if (error) { status.textContent = `Não foi possível procurar: ${error.message}`; cancelButton.disabled = false; return; }
  if (data) { location.href = `chat.html?conversation=${encodeURIComponent(data)}`; return; }
  await new Promise(r => setTimeout(r, 1800));
  return find();
}
find();
