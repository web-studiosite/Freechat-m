import { supabase, isConfigured } from "./supabase.js";
import { me, getProfile } from "./auth.js";
import { startPresence } from "./presence.js";

const $ = (selector) => document.querySelector(selector);
const result = $("#result");
const saveButton = $("#save");
const nicknameInput = $("#nickname");
const availableInput = $("#available");
const nextActions = $("#nextActions");
const title = $("#title");
const intro = $("#intro");

let currentUser = null;

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
    currentUser = await me();
    if (!currentUser) {
      show("Não foi possível iniciar a sessão. Ative Anonymous Sign-Ins no Supabase e tente novamente.", "error");
      return;
    }

    await startPresence();

    const profile = await getProfile(currentUser.id);
    const setupMode = new URLSearchParams(location.search).get("setup") === "1";

    if (profile) {
      nicknameInput.value = profile.nickname || "";
      availableInput.checked = profile.available !== false;
      title.textContent = "Seu perfil";
      intro.textContent = "Você pode editar seu apelido ou disponibilidade a qualquer momento.";
      nextActions.hidden = false;
      show("Perfil carregado.");
    } else {
      availableInput.checked = true;
      title.textContent = "Crie seu perfil";
      intro.textContent = "Escolha um apelido. Depois de salvar, você poderá encontrar alguém para conversar.";
      nextActions.hidden = true;
      show(setupMode ? "Vamos criar seu perfil primeiro." : "Escolha um apelido para começar.");
    }

    saveButton.disabled = false;
  } catch (error) {
    console.error("Erro ao carregar perfil:", error);
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

  if (!currentUser) {
    show("Sua sessão não está disponível. Recarregue a página e tente novamente.", "error");
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Salvando...";
  show("Salvando seu perfil...");

  try {
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: currentUser.id,
        nickname: name,
        available: availableInput.checked,
        online: true,
        last_seen: new Date().toISOString()
      }, { onConflict: "id" });

    if (error) throw error;

    show("✓ Perfil salvo com sucesso!", "success");
    nextActions.hidden = false;
    title.textContent = "Perfil pronto!";
    intro.textContent = "Agora você já pode iniciar uma conversa ou escolher alguém que esteja online.";

    // O parâmetro setup não causa mais um beco sem saída:
    // permanecemos aqui e mostramos imediatamente as próximas ações.
    history.replaceState({}, "", "profile.html");
  } catch (error) {
    console.error("Erro ao salvar perfil:", error);
    show(`Não foi possível salvar: ${error.message || error}`, "error");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "💾 Salvar perfil";
  }
}

saveButton.addEventListener("click", saveProfile);

init();
