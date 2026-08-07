import { Router } from "express";
import { exigirLogin } from "../auth.js";
import { extrairComando, conhecimento } from "../conhecimento.js";
import { gerarTitulo, responder, type ImagemEntrada } from "../claude.js";
import {
  acharConversa,
  apagarConversa,
  criarConversa,
  listarConversas,
  salvar,
} from "../db.js";

export const rotasChat = Router();

rotasChat.use(exigirLogin);

const TIPOS_IMAGEM = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGENS = 8;
const MAX_BYTES_IMAGEM = 5 * 1024 * 1024; // ~5 MB por imagem

rotasChat.get("/comandos", (req, res) => {
  res.json(
    conhecimento().comandos.map((c) => ({
      nome: c.nome,
      titulo: c.titulo,
      descricao: c.descricao,
      aceitaImagem: c.aceitaImagem,
    })),
  );
});

rotasChat.get("/conversas", (req, res) => {
  res.json(
    listarConversas(req.usuario!.id).map((c) => ({
      id: c.id,
      titulo: c.titulo,
      atualizadaEm: c.atualizadaEm,
    })),
  );
});

rotasChat.post("/conversas", (req, res) => {
  const conversa = criarConversa(req.usuario!.id, "Nova conversa");
  res.status(201).json({ id: conversa.id, titulo: conversa.titulo, mensagens: [] });
});

rotasChat.get("/conversas/:id", (req, res) => {
  const conversa = acharConversa(req.params.id, req.usuario!.id);
  if (!conversa) {
    res.status(404).json({ erro: "Conversa não encontrada" });
    return;
  }
  res.json(conversa);
});

rotasChat.delete("/conversas/:id", (req, res) => {
  const ok = apagarConversa(req.params.id, req.usuario!.id);
  res.status(ok ? 204 : 404).end();
});

/** Envia mensagem e recebe a resposta por SSE. */
rotasChat.post("/chat", async (req, res) => {
  const { conversaId, texto, imagens } = req.body ?? {};

  const conversa = acharConversa(String(conversaId ?? ""), req.usuario!.id);
  if (!conversa) {
    res.status(404).json({ erro: "Conversa não encontrada" });
    return;
  }

  const textoBruto = typeof texto === "string" ? texto.trim() : "";
  const brutas: unknown[] = Array.isArray(imagens) ? imagens : [];

  if (brutas.length > MAX_IMAGENS) {
    res.status(400).json({ erro: `Máximo de ${MAX_IMAGENS} imagens por mensagem` });
    return;
  }

  const validas: ImagemEntrada[] = [];
  for (const item of brutas) {
    const img = item as Partial<ImagemEntrada>;
    if (!img || typeof img.data !== "string" || typeof img.media_type !== "string") {
      res.status(400).json({ erro: "Imagem em formato inválido" });
      return;
    }
    if (!TIPOS_IMAGEM.has(img.media_type)) {
      res.status(400).json({ erro: `Tipo de imagem não suportado: ${img.media_type}` });
      return;
    }
    // base64 ocupa ~4/3 do tamanho original
    if (img.data.length * 0.75 > MAX_BYTES_IMAGEM) {
      res.status(400).json({ erro: "Imagem acima de 5 MB — reduza antes de enviar" });
      return;
    }
    validas.push({ media_type: img.media_type as ImagemEntrada["media_type"], data: img.data });
  }

  if (!textoBruto && validas.length === 0) {
    res.status(400).json({ erro: "Mensagem vazia" });
    return;
  }

  const { comando, texto: textoLimpo } = extrairComando(textoBruto);

  if (comando?.aceitaImagem === "obrigatoria" && validas.length === 0) {
    res.status(400).json({ erro: `O comando /${comando.nome} precisa de pelo menos uma imagem` });
    return;
  }

  const historico = [...conversa.mensagens];

  conversa.mensagens.push({
    papel: "user",
    texto: textoLimpo,
    comando: comando?.nome,
    imagens: validas.length || undefined,
    em: new Date().toISOString(),
  });
  conversa.atualizadaEm = new Date().toISOString();
  salvar();

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const enviar = (evento: string, dados: unknown) => {
    res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
  };

  let resposta = "";
  try {
    for await (const pedaco of responder({
      historico,
      texto: textoLimpo,
      imagens: validas,
      comando,
      nomeUsuario: req.usuario!.nome,
    })) {
      resposta += pedaco;
      enviar("texto", pedaco);
    }
  } catch (e: any) {
    console.error("[chat] erro na chamada ao modelo:", e);
    const detalhe =
      e?.status === 401 || e?.status === 403
        ? "Credenciais do provedor recusadas. Confira a chave/permissões no .env."
        : e?.status === 429
          ? "Limite de requisições atingido. Tente de novo em instantes."
          : (e?.message ?? "Erro desconhecido");
    enviar("erro", { mensagem: detalhe });
    res.end();
    return;
  }

  conversa.mensagens.push({
    papel: "assistant",
    texto: resposta,
    em: new Date().toISOString(),
  });
  conversa.atualizadaEm = new Date().toISOString();

  // Primeira troca da conversa: gera um título de verdade.
  let tituloNovo: string | undefined;
  if (conversa.titulo === "Nova conversa") {
    const semente = comando ? `/${comando.nome} ${textoLimpo}` : textoLimpo;
    tituloNovo = await gerarTitulo(semente || "Leitura de imagem");
    conversa.titulo = tituloNovo;
  }
  salvar();

  enviar("fim", { titulo: tituloNovo });
  res.end();
});
