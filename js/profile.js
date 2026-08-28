import { supabase } from "./supabase.js";
import { me, getProfile } from "./auth.js";

const nicknameInput = document.getElementById("nickname");
const availableInput = document.getElementById("available");
const form = document.getElementById("profileForm");
const saveButton = document.getElementById("save");
const title = document.getElementById("title");
const intro = document.getElementById("intro");
const errorBox = document.getElementById("profileError");
const actions = document.getElementById("profileActions");
const successMessage = document.getElementById("successMessage");

function setError(message) {
  if (errorBox) errorBox.textContent = message || "";
}

function setSuccess(message) {
  if (successMessage) successMessage.textContent = message || "";
}

function showActions(show) {
  if (actions) actions.hidden = !show;
}

function validNickname(value) {
  return value.length >= 2 && value.length <= 30;
}

let user = null;

try {
  user = await me();

  if (!user) {
    setError("Não foi possível iniciar a sessão. Recarregue a página e tente novamente.");
    if (saveButton) saveButton.disabled = true;
    throw new Error("No authenticated user");
  }

  const profile = await getProfile(user.id);
  const params = new URLSearchParams(location.search);
  const isSetup = params.get("setup") === "1";

  if (profile) {
    if (nicknameInput) nicknameInput.value = profile.nickname || "";
    if (availableInput) availableInput.checked = profile.available !== false;

    if (title) title.textContent = "Seu perfil";
    if (intro) intro.textContent = "Atualize seu nickname ou escolha se quer aparecer como disponível.";
  } else if (isSetup) {
    if (title) title.textContent = "Crie seu perfil";
    if (intro) intro.textContent = "Antes de conversar, escolha um nickname.";
  }

  // The user must explicitly save before seeing the action buttons.
  showActions(false);

} catch (error) {
  console.error("Erro ao carregar o perfil:", error);

  // Do not overwrite a useful message already shown above.
  if (!errorBox?.textContent) {
    setError("Erro ao carregar o perfil. Verifique a conexão com o Supabase e tente novamente.");
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");
  setSuccess("");

  if (!user) {
    setError("Sua sessão não está disponível. Recarregue a página.");
    return;
  }

  const nickname = (nicknameInput?.value || "").trim();
  const available = availableInput?.checked === true;

  if (!validNickname(nickname)) {
    setError("O apelido deve ter entre 2 e 30 caracteres.");
    nicknameInput?.focus();
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Salvando...";

  try {
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          nickname,
          available,
          online: true,
          last_seen: new Date().toISOString()
        },
        { onConflict: "id" }
      );

    if (error) {
      console.error("Erro Supabase ao salvar perfil:", error);
      setError(`Não foi possível salvar o perfil: ${error.message}`);
      return;
    }

    if (title) title.textContent = "✓ Perfil pronto!";
    if (intro) intro.textContent = `Olá, ${nickname}! O que você quer fazer agora?`;

    setSuccess("Seu perfil foi salvo com sucesso.");
    showActions(true);

    // Remove setup flag without causing another page load.
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("setup");
    history.replaceState({}, "", cleanUrl);

    // If the user arrived because they wanted to start a random conversation,
    // keep them on the profile page so there is no dead end. They can choose
    // the action explicitly from the buttons now.
  } catch (error) {
    console.error("Erro inesperado ao salvar perfil:", error);
    setError("Ocorreu um erro ao salvar o perfil. Tente novamente.");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "💾 Salvar perfil";
  }
});

// Keep the current user marked online while the profile page is open.
const heartbeat = setInterval(async () => {
  if (!user) return;

  const { error } = await supabase
    .from("profiles")
    .update({
      online: true,
      last_seen: new Date().toISOString()
    })
    .eq("id", user.id);

  if (error) console.warn("Heartbeat do perfil:", error.message);
}, 20000);

window.addEventListener("pagehide", () => {
  clearInterval(heartbeat);
  // Best effort only; pagehide may terminate network requests.
  supabase
    .from("profiles")
    .update({
      online: false,
      last_seen: new Date().toISOString()
    })
    .eq("id", user?.id);
});
