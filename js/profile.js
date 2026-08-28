import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from "./supabase.js";
import { me, getProfile } from "./auth.js";
import { startPresence } from "./presence.js";

const $ = (selector) => document.querySelector(selector);
const result = $("#result");
const saveButton = $("#save");
const nicknameInput = $("#nickname");
const availableInput = $("#available");

function show(message, type = "info") {
  result.textContent = message;
  result.dataset.type = type;
}

async function init() {
  if (!isConfigured()) {
    show("Configure SUPABASE_URL e SUPABASE_ANON_KEY em js/supabase.js antes de continuar.", "error");
    saveButton.disabled = true;
    return;
  }

  saveButton.disabled = true;
  show("A verificar a sessão...");

  try {
    const user = await me();
    if (!user) {
      show("Não foi possível iniciar a sessão. Ative Anonymous Sign-Ins no Supabase e tente novamente.", "error");
      return;
    }

    await startPresence();
    const profile = await getProfile(user.id);
    if (profile) {
      nicknameInput.value = profile.nickname || "";
      availableInput.checked = profile.available !== false;
    } else {
      availableInput.checked = true;
    }

    saveButton.disabled = false;
    show(profile ? "Perfil carregado." : "Escolha um apelido para começar.");
    saveButton.addEventListener("click", saveProfile, { once: false });
  } catch (error) {
    console.error(error);
    show(`Erro ao carregar o perfil: ${error.message || error}`, "error");
  }
}

async function saveProfile() {
  const name = nicknameInput.value.trim();
  if (name.length < 2 || name.length > 30) {
    show("O apelido deve ter entre 2 e 30 caracteres.", "error");
    nicknameInput.focus();
    return;
  }
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) {
    show("Use apenas letras, números, espaços, ponto, hífen ou underscore.", "error");
    nicknameInput.focus();
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Salvando...";
  show("Salvando seu perfil...");

  try {
    const user = await me();
    if (!user) throw new Error("Sua sessão expirou. Recarregue a página e tente novamente.");

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      nickname: name,
      available: availableInput.checked,
      online: true,
      last_seen: new Date().toISOString()
    }, { onConflict: "id" });

    if (error) throw error;
    show("✓ Perfil salvo com sucesso!", "success");
    if (new URLSearchParams(location.search).get("setup")) {
      setTimeout(() => { location.href = "index.html"; }, 700);
    }
  } catch (error) {
    console.error("Erro ao salvar perfil:", error);
    show(`Não foi possível salvar: ${error.message || error}`, "error");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Salvar perfil";
  }
}

init();
