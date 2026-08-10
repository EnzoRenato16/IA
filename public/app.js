import { renderMarkdown } from "/md.js";

const $ = (id) => document.getElementById(id);

/**
 * Referência guardada para o painel de boas-vindas.
 * Ele vive dentro de #mensagens, que é limpo a cada troca de conversa — sem manter
 * esta referência, limpar a área destruía o elemento (e a grade de comandos dentro
 * dele) e as chamadas seguintes falhavam em elemento nulo.
 */
const elBoasVindas = $("boas-vindas");

function limparMensagens() {
  $("mensagens").replaceChildren();
}

function exibirBoasVindas(visivel) {
  if (visivel && !elBoasVindas.isConnected) {
    $("mensagens").appendChild(elBoasVindas);
  }
  elBoasVindas.hidden = !visivel;
}

const estado = {
  usuario: null,
  conversaId: null,
  comandos: [],
  anexos: [], // { media_type, data, url, nome }
  enviando: false,
};

// ---------- utilidades ----------

async function api(url, opcoes = {}) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opcoes,
  });
  if (r.status === 401) {
    mostrarLogin();
    throw new Error("Sessão expirada");
  }
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro ${r.status}`);
  }
  return r.status === 204 ? null : r.json();
}

function mostrarLogin() {
  $("tela-login").hidden = false;
  $("app").hidden = true;
}

// ---------- login ----------

$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(e.target));
  const erro = $("erro-login");
  erro.hidden = true;
  // Duas etapas separadas: falha de credencial e falha ao carregar a tela têm
  // causas diferentes e não devem exibir a mesma mensagem.
  try {
    estado.usuario = await api("/api/login", { method: "POST", body: JSON.stringify(dados) });
  } catch (ex) {
    erro.textContent = ex.message;
    erro.hidden = false;
    return;
  }

  try {
    await iniciar();
  } catch (ex) {
    console.error("[app] falha ao carregar a interface:", ex);
    erro.textContent = `Login OK, mas a tela falhou ao carregar: ${ex.message}`;
    erro.hidden = false;
  }
});

$("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.reload();
});

// ---------- boot ----------

async function iniciar() {
  const me = await api("/api/me");
  estado.usuario = me;

  $("tela-login").hidden = true;
  $("app").hidden = false;
  $("nome-assessoria").textContent = me.assessoria;
  $("titulo-login").textContent = `IA · ${me.assessoria}`;
  $("nome-usuario").textContent = me.nome;
  $("papel-usuario").textContent = me.papel === "admin" ? "administrador" : "assessor";
  $("link-admin").hidden = me.papel !== "admin";

  estado.comandos = await api("/api/comandos");
  montarGradeComandos();
  await carregarConversas();
  await novaConversa();
}

function montarGradeComandos() {
  // Busca dentro da referência guardada: funciona mesmo com o painel fora do DOM.
  elBoasVindas.querySelector("#grade-comandos").innerHTML = estado.comandos
    .map(
      (c) => `
      <button class="chip-comando" data-cmd="${c.nome}">
        <strong>/${c.nome}</strong>
        <span>${c.descricao}</span>
      </button>`,
    )
    .join("");

  for (const b of document.querySelectorAll(".chip-comando")) {
    b.addEventListener("click", () => {
      $("entrada").value = `/${b.dataset.cmd} `;
      $("entrada").focus();
      ajustarAltura();
    });
  }
}

// ---------- conversas ----------

async function carregarConversas() {
  const lista = await api("/api/conversas");
  $("lista-conversas").innerHTML = lista
    .map(
      (c) => `
      <div class="item-conversa ${c.id === estado.conversaId ? "ativo" : ""}" data-id="${c.id}">
        <span>${c.titulo}</span>
        <button class="btn-apagar" data-apagar="${c.id}" title="Apagar">×</button>
      </div>`,
    )
    .join("");

  for (const el of document.querySelectorAll(".item-conversa")) {
    el.addEventListener("click", (e) => {
      if (e.target.dataset.apagar) return;
      abrirConversa(el.dataset.id);
    });
  }
  for (const b of document.querySelectorAll("[data-apagar]")) {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      await api(`/api/conversas/${b.dataset.apagar}`, { method: "DELETE" });
      if (b.dataset.apagar === estado.conversaId) await novaConversa();
      else await carregarConversas();
    });
  }
}

async function novaConversa() {
  const c = await api("/api/conversas", { method: "POST" });
  estado.conversaId = c.id;
  $("titulo-conversa").textContent = c.titulo;
  limparMensagens();
  exibirBoasVindas(true);
  await carregarConversas();
}

async function abrirConversa(id) {
  const c = await api(`/api/conversas/${id}`);
  estado.conversaId = c.id;
  $("titulo-conversa").textContent = c.titulo;
  limparMensagens();
  exibirBoasVindas(false);
  for (const m of c.mensagens) {
    adicionarBolha(m.papel, m.texto, { comando: m.comando, imagens: m.imagens });
  }
  rolarFim();
  await carregarConversas();
  fecharLateralMobile();
}

$("btn-nova").addEventListener("click", novaConversa);

// ---------- mensagens ----------

function adicionarBolha(papel, texto, extras = {}) {
  elBoasVindas.hidden = true;
  const div = document.createElement("div");
  div.className = `bolha ${papel}`;

  let cabecalho = "";
  if (extras.comando) cabecalho += `<span class="tag">/${extras.comando}</span>`;
  if (extras.imagens) cabecalho += `<span class="tag">${extras.imagens} imagem(ns)</span>`;
  if (extras.miniaturas) cabecalho += extras.miniaturas;

  div.innerHTML =
    (cabecalho ? `<div class="meta">${cabecalho}</div>` : "") +
    `<div class="corpo">${papel === "user" ? escaparHtml(texto) : renderMarkdown(texto)}</div>`;

  $("mensagens").appendChild(div);
  return div.querySelector(".corpo");
}

function escaparHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML.replace(/\n/g, "<br />");
}

function rolarFim() {
  $("mensagens").scrollTop = $("mensagens").scrollHeight;
}

// ---------- anexos ----------

function desenharAnexos() {
  const box = $("anexos");
  box.hidden = estado.anexos.length === 0;
  box.innerHTML = estado.anexos
    .map(
      (a, i) => `
      <div class="anexo">
        <img src="${a.url}" alt="${a.nome}" />
        <button data-remover="${i}" title="Remover">×</button>
      </div>`,
    )
    .join("");
  for (const b of box.querySelectorAll("[data-remover]")) {
    b.addEventListener("click", () => {
      estado.anexos.splice(Number(b.dataset.remover), 1);
      desenharAnexos();
    });
  }
}

const TIPOS_OK = ["image/png", "image/jpeg", "image/gif", "image/webp"];

async function adicionarArquivos(arquivos) {
  for (const arquivo of arquivos) {
    if (!TIPOS_OK.includes(arquivo.type)) {
      alert(`Formato não suportado: ${arquivo.type || arquivo.name}. Use PNG, JPG, GIF ou WebP.`);
      continue;
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      alert(`"${arquivo.name}" passa de 5 MB. Reduza a imagem antes de enviar.`);
      continue;
    }
    const dataUrl = await new Promise((ok) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.readAsDataURL(arquivo);
    });
    estado.anexos.push({
      media_type: arquivo.type,
      data: String(dataUrl).split(",")[1],
      url: dataUrl,
      nome: arquivo.name || "print",
    });
  }
  desenharAnexos();
}

$("btn-anexar").addEventListener("click", () => $("input-arquivo").click());
$("input-arquivo").addEventListener("change", (e) => {
  adicionarArquivos([...e.target.files]);
  e.target.value = "";
});

document.addEventListener("paste", (e) => {
  const arquivos = [...(e.clipboardData?.files ?? [])];
  if (arquivos.length) {
    e.preventDefault();
    adicionarArquivos(arquivos);
  }
});

document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files?.length) adicionarArquivos([...e.dataTransfer.files]);
});

// ---------- menu de comandos ----------

const menu = $("menu-comandos");

function atualizarMenuComandos() {
  const v = $("entrada").value;
  const m = v.match(/^\/([\p{L}\d_-]*)$/u);
  if (!m) {
    menu.hidden = true;
    return;
  }
  const filtro = m[1].toLowerCase();
  const achados = estado.comandos.filter((c) => c.nome.startsWith(filtro));
  if (achados.length === 0) {
    menu.hidden = true;
    return;
  }
  menu.innerHTML = achados
    .map(
      (c) => `
      <button data-cmd="${c.nome}">
        <strong>/${c.nome}</strong>
        <span>${c.descricao}</span>
        ${c.aceitaImagem === "obrigatoria" ? '<em class="tag">precisa de imagem</em>' : ""}
      </button>`,
    )
    .join("");
  menu.hidden = false;
  for (const b of menu.querySelectorAll("[data-cmd]")) {
    b.addEventListener("click", () => {
      $("entrada").value = `/${b.dataset.cmd} `;
      menu.hidden = true;
      $("entrada").focus();
    });
  }
}

// ---------- envio ----------

const entrada = $("entrada");

function ajustarAltura() {
  entrada.style.height = "auto";
  entrada.style.height = `${Math.min(entrada.scrollHeight, 200)}px`;
}

entrada.addEventListener("input", () => {
  ajustarAltura();
  atualizarMenuComandos();
});

entrada.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("form-envio").requestSubmit();
  }
  if (e.key === "Escape") menu.hidden = true;
});

$("form-envio").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (estado.enviando) return;

  const texto = entrada.value.trim();
  if (!texto && estado.anexos.length === 0) return;

  const anexos = estado.anexos;
  const m = texto.match(/^\/([\p{L}\d_-]+)/u);
  const nomeCmd = m && estado.comandos.some((c) => c.nome === m[1].toLowerCase()) ? m[1].toLowerCase() : null;

  const miniaturas = anexos.map((a) => `<img class="mini" src="${a.url}" alt="" />`).join("");
  adicionarBolha("user", nomeCmd ? texto.slice(nomeCmd.length + 1).trim() : texto, {
    comando: nomeCmd,
    miniaturas,
  });

  entrada.value = "";
  ajustarAltura();
  estado.anexos = [];
  desenharAnexos();
  menu.hidden = true;
  rolarFim();

  estado.enviando = true;
  $("btn-enviar").disabled = true;

  const corpo = adicionarBolha("assistant", "");
  corpo.innerHTML = '<span class="pensando">Pensando…</span>';
  rolarFim();

  let acumulado = "";
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversaId: estado.conversaId,
        texto,
        imagens: anexos.map((a) => ({ media_type: a.media_type, data: a.data })),
      }),
    });

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.erro || `Erro ${r.status}`);
    }

    const leitor = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const blocos = buffer.split("\n\n");
      buffer = blocos.pop() ?? "";

      for (const bloco of blocos) {
        const linhaEvento = bloco.match(/^event: (.+)$/m);
        const linhaDados = bloco.match(/^data: ([\s\S]+)$/m);
        if (!linhaEvento || !linhaDados) continue;

        const dados = JSON.parse(linhaDados[1]);
        if (linhaEvento[1] === "texto") {
          acumulado += dados;
          corpo.innerHTML = renderMarkdown(acumulado);
          rolarFim();
        } else if (linhaEvento[1] === "erro") {
          throw new Error(dados.mensagem);
        } else if (linhaEvento[1] === "fim") {
          if (dados.titulo) {
            $("titulo-conversa").textContent = dados.titulo;
            await carregarConversas();
          }
        }
      }
    }
  } catch (ex) {
    corpo.innerHTML = `<div class="erro-bolha">${escaparHtml(ex.message)}</div>`;
  } finally {
    estado.enviando = false;
    $("btn-enviar").disabled = false;
    rolarFim();
    entrada.focus();
  }
});

// ---------- mobile ----------

$("btn-menu").addEventListener("click", () => $("lateral").classList.toggle("aberta"));
function fecharLateralMobile() {
  $("lateral").classList.remove("aberta");
}

// ---------- start ----------

iniciar().catch(() => mostrarLogin());
