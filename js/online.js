import { supabase } from "./supabase.js";
import { me } from "./auth.js";
import { startPresence, ONLINE_WINDOW_MS } from "./presence.js";

const user = await me();
if (!user) { location.href = "index.html"; throw new Error("Sem sessão"); }
await startPresence();
const people = document.querySelector("#people");
const search = document.querySelector("#search");
const notice = document.querySelector("#notice");

function escapeHtml(s = "") { return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }
function cutoff() { return new Date(Date.now() - ONLINE_WINDOW_MS).toISOString(); }

async function load() {
  const { data, error } = await supabase.from("profiles")
    .select("id,nickname,avatar,online,available,last_seen")
    .eq("online", true).eq("available", true).neq("id", user.id)
    .gte("last_seen", cutoff()).order("last_seen", { ascending:false }).limit(100);
  if (error) { notice.textContent = `Não foi possível carregar a lista: ${error.message}`; return; }
  const q = search.value.trim().toLowerCase();
  const list = (data || []).filter(x => (x.nickname || "").toLowerCase().includes(q));
  people.innerHTML = list.length ? list.map(p => `
    <article class="person">
      <div class="avatar">${escapeHtml((p.nickname || "?")[0].toUpperCase())}</div>
      <div class="person-info"><strong>${escapeHtml(p.nickname)}</strong><small>🟢 Disponível</small></div>
      <button type="button" class="chat-button" data-id="${p.id}">Conversar</button>
    </article>`).join("") : `<div class="card">Ninguém disponível no momento.</div>`;
  people.querySelectorAll("[data-id]").forEach(b => b.addEventListener("click", () => start(b.dataset.id)));
}

async function start(partner) {
  const buttons = [...people.querySelectorAll("button")]; buttons.forEach(b => b.disabled = true);
  const { data, error } = await supabase.rpc("start_direct_conversation", { other_user: partner });
  if (error) { alert(error.message); buttons.forEach(b => b.disabled = false); return; }
  location.href = `chat.html?conversation=${encodeURIComponent(data)}`;
}

search.addEventListener("input", load);
await load();
setInterval(load, 15000);
supabase.channel("online-list")
  .on("postgres_changes", { event:"*", schema:"public", table:"profiles" }, load)
  .subscribe();
