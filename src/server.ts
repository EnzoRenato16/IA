import express from "express";
import path from "node:path";
import { config } from "./config.js";
import {
  conferirSenha,
  criarSessao,
  encerrarSessao,
  exigirLogin,
  usuarioDaRequisicao,
} from "./auth.js";
import { acharUsuarioPorEmail, listarUsuarios } from "./db.js";
import { conhecimento } from "./conhecimento.js";
import { rotasChat } from "./rotas/chat.js";
import { rotasAdmin } from "./rotas/admin.js";

const app = express();

app.disable("x-powered-by");
// Imagens chegam em base64 no corpo do JSON — daí o limite alto.
app.use(express.json({ limit: "40mb" }));

// ---------- autenticação ----------

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 5 * 60 * 1000;

const tentativas = new Map<string, { n: number; bloqueadoAte: number }>();

app.post("/api/login", (req, res) => {
  const { email, senha } = req.body ?? {};

  if (typeof email !== "string" || typeof senha !== "string") {
    res.status(400).json({ erro: "Informe e-mail e senha" });
    return;
  }

  const chave = email.trim().toLowerCase();
  const registro = tentativas.get(chave);

  if (registro && registro.n >= MAX_TENTATIVAS) {
    const restanteMs = registro.bloqueadoAte - Date.now();
    if (restanteMs > 0) {
      // Importante: NÃO renovar o bloqueio aqui. Renovar a cada tentativa deixava
      // o usuário travado para sempre se ele continuasse tentando.
      const seg = Math.ceil(restanteMs / 1000);
      res.status(429).json({
        erro:
          `Bloqueado por ${MAX_TENTATIVAS} tentativas erradas. ` +
          `Tente de novo em ${seg > 60 ? `${Math.ceil(seg / 60)} min` : `${seg}s`}.`,
      });
      return;
    }
    tentativas.delete(chave); // bloqueio venceu
  }

  const usuario = acharUsuarioPorEmail(email);
  if (!usuario || !conferirSenha(senha, usuario.hashSenha)) {
    const atual = tentativas.get(chave) ?? { n: 0, bloqueadoAte: 0 };
    atual.n += 1;
    if (atual.n >= MAX_TENTATIVAS) atual.bloqueadoAte = Date.now() + BLOQUEIO_MS;
    tentativas.set(chave, atual);

    const restam = MAX_TENTATIVAS - atual.n;
    let mensagem = "E-mail ou senha incorretos";
    if (restam <= 0) {
      mensagem += `. Login bloqueado por ${BLOQUEIO_MS / 60000} minutos.`;
    } else if (restam <= 2) {
      mensagem += `. ${restam} tentativa(s) antes do bloqueio.`;
    }
    res.status(401).json({ erro: mensagem });
    return;
  }

  tentativas.delete(chave);
  criarSessao(res, usuario);
  res.json({ id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel });
});

app.post("/api/logout", (req, res) => {
  encerrarSessao(res);
  res.status(204).end();
});

app.get("/api/me", (req, res) => {
  const usuario = usuarioDaRequisicao(req);
  if (!usuario) {
    res.status(401).json({ erro: "Não autenticado" });
    return;
  }
  res.json({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    assessoria: config.nomeAssessoria,
  });
});

// ---------- API ----------

// Aberta de propósito, para monitoramento. Não expõe nada sensível.
app.get("/api/saude", (req, res) => {
  const k = conhecimento();
  res.json({
    ok: true,
    provider: config.provider,
    modelo: config.modelo,
    esforco: config.esforco,
    arquivosBase: k.base.length,
    comandos: k.comandos.length,
    usuarios: listarUsuarios().length,
  });
});

// Ordem importa: estes routers exigem login para tudo que entra neles,
// então precisam vir depois das rotas públicas acima.
app.use("/api/admin", rotasAdmin);
app.use("/api", rotasChat);

// ---------- páginas ----------

app.use(express.static(config.dirPublico));

app.get("/admin", exigirLogin, (req, res) => {
  if (req.usuario?.papel !== "admin") {
    res.redirect("/");
    return;
  }
  res.sendFile(path.join(config.dirPublico, "admin.html"));
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ erro: "Rota não encontrada" });
    return;
  }
  res.sendFile(path.join(config.dirPublico, "index.html"));
});

// ---------- start ----------

const k = conhecimento();

if (listarUsuarios().length === 0) {
  console.log("\n⚠️  Nenhum usuário cadastrado ainda.");
  console.log("   Crie o primeiro com:  npm run criar-usuario\n");
}

app.listen(config.porta, () => {
  console.log(`\n  ${config.nomeAssessoria} — IA interna`);
  console.log(`  http://localhost:${config.porta}`);
  console.log(`  provider: ${config.provider} · modelo: ${config.modelo} · esforço: ${config.esforco}`);
  console.log(`  base: ${k.base.length} arquivos · comandos: ${k.comandos.length}\n`);
});
