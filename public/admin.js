const $ = (id) => document.getElementById(id);

let atual = null; // { pasta, arquivo }

async function api(url, opcoes = {}) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opcoes });
  if (r.status === 401 || r.status === 403) {
    location.href = "/";
    throw new Error("Sem permissão");
  }
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro ${r.status}`);
  }
  return r.status === 204 ? null : r.json();
}

function status(texto, erro = false) {
  const el = $("status");
  el.textContent = texto;
  el.style.color = erro ? "var(--erro)" : "var(--texto-suave)";
}

async function montar() {
  const { base, comandos } = await api("/api/admin/arquivos");

  $("lista-base").innerHTML = base
    .map((a) => `<button data-pasta="base" data-arquivo="${a}">${a}</button>`)
    .join("");

  $("lista-comandos").innerHTML = comandos
    .map((c) => `<button data-pasta="comandos" data-arquivo="${c.arquivo}">/${c.nome}</button>`)
    .join("");

  for (const b of document.querySelectorAll("[data-arquivo]")) {
    b.addEventListener("click", () => abrir(b.dataset.pasta, b.dataset.arquivo, b));
  }
}

async function abrir(pasta, arquivo, botao) {
  const r = await api(`/api/admin/arquivos/${pasta}/${encodeURIComponent(arquivo)}`);
  atual = { pasta, arquivo };
  $("editor").value = r.conteudo;
  $("btn-salvar").disabled = false;
  status(`${pasta}/${arquivo}`);
  for (const b of document.querySelectorAll("[data-arquivo]")) b.classList.remove("ativo");
  botao.classList.add("ativo");
}

$("btn-salvar").addEventListener("click", async () => {
  if (!atual) return;
  $("btn-salvar").disabled = true;
  status("Salvando…");
  try {
    await api(`/api/admin/arquivos/${atual.pasta}/${encodeURIComponent(atual.arquivo)}`, {
      method: "PUT",
      body: JSON.stringify({ conteudo: $("editor").value }),
    });
    status(`Salvo e recarregado · ${new Date().toLocaleTimeString("pt-BR")}`);
  } catch (e) {
    status(e.message, true);
  } finally {
    $("btn-salvar").disabled = false;
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
    e.preventDefault();
    $("btn-salvar").click();
  }
});

montar().catch((e) => status(e.message, true));
