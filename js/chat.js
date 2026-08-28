import { supabase } from "./supabase.js";
import { me } from "./auth.js";
import { startPresence } from "./presence.js";

const user = await me();
const conversationId = new URLSearchParams(location.search).get("conversation");
if (!user || !conversationId) { location.href = "messages.html"; throw new Error("Conversa inválida"); }
await startPresence();
const box = document.querySelector("#messages"), input = document.querySelector("#input"), form = document.querySelector("#composer");
const partnerEl = document.querySelector("#partner"), statusEl = document.querySelector("#partnerStatus");
const menu = document.querySelector("#menu");

function escapeHtml(s="") { return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }
function bubble(m) { const mine=m.sender_id===user.id; const t=new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}); return `<div class="bubble ${mine?"mine":""}" data-message-id="${m.id}">${escapeHtml(m.content)}<time>${t}</time></div>`; }

async function loadHeader(){
  const {data,error}=await supabase.rpc("conversation_partner", { p_conversation_id: conversationId });
  if(error || !data?.length) { location.href="messages.html"; return false; }
  const p=data[0]; partnerEl.textContent=p.nickname; statusEl.textContent=p.online?"🟢 Online":"⚪ Offline"; return true;
}
async function loadMessages(){
  const {data,error}=await supabase.from("messages").select("id,sender_id,content,created_at").eq("conversation_id",conversationId).order("created_at",{ascending:true});
  if(error){box.innerHTML=`<div class="notice">Não foi possível carregar as mensagens: ${escapeHtml(error.message)}</div>`;return;}
  box.innerHTML=(data||[]).map(bubble).join(""); box.scrollTop=box.scrollHeight; await supabase.rpc("mark_conversation_read",{p_conversation_id:conversationId});
}
form.addEventListener("submit", async e=>{
  e.preventDefault(); const content=input.value.trim(); if(!content)return;
  const submit=form.querySelector("button"); submit.disabled=true;
  const {error}=await supabase.from("messages").insert({conversation_id:conversationId,sender_id:user.id,content});
  if(error) alert(`Não foi possível enviar: ${error.message}`); else input.value="";
  submit.disabled=false; input.focus();
});
document.querySelector("#menuBtn").addEventListener("click",()=>menu.classList.toggle("hidden"));
document.querySelector("#leaveBtn").addEventListener("click",async()=>{await supabase.rpc("leave_conversation",{p_conversation_id:conversationId});location.href="messages.html";});
document.querySelector("#blockBtn").addEventListener("click",async()=>{if(!confirm("Bloquear esta pessoa?"))return;const {error}=await supabase.rpc("block_conversation_partner",{p_conversation_id:conversationId});if(error)alert(error.message);else location.href="messages.html";});
document.querySelector("#reportBtn").addEventListener("click",async()=>{const reason=prompt("Motivo da denúncia:");if(!reason?.trim())return;const {error}=await supabase.rpc("report_conversation_partner",{p_conversation_id:conversationId,p_reason:reason.trim()});alert(error?`Não foi possível denunciar: ${error.message}`:"Denúncia enviada.");});
if(await loadHeader()) await loadMessages();
supabase.channel("chat-"+conversationId).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`conversation_id=eq.${conversationId}`},payload=>{
  if(payload.new.sender_id!==user.id && !box.querySelector(`[data-message-id="${payload.new.id}"]`)){box.insertAdjacentHTML("beforeend",bubble(payload.new));box.scrollTop=box.scrollHeight;supabase.rpc("mark_conversation_read",{p_conversation_id:conversationId});}
}).subscribe();
