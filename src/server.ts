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

const tentativas = new Map<string, { n: number; ate: number }>();

app.post("/api/login", (req, res) => {
  const { email, senha } = req.body ?? {};

  if (typeof email !== "string" || typeof senha !== "string") {
    res.status(400).json({ erro: "Informe e-mail e senha" });
    return;
  }

  const chave = email.trim().toLowerCase();
  const bloqueio = tentativas.get(chave);
  if (bloqueio && bloqueio.n >= 5 && Date.now() < bloqueio.ate) {
    res.status(429).json({ erro: "Muitas tentativas. Aguarde alguns minutos." });
    return;
  }

  const usuario = acharUsuarioPorEmail(email);
  if (!usuario || !conferirSenha(senha, usuario.hashSenha)) {
    const n = (bloqueio?.n ?? 0) + 1;
    tentativas.set(chave, { n, ate: Date.now() + 5 * 60 * 1000 });
    res.status(401).json({ erro: "E-mail ou senha incorretos" });
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
