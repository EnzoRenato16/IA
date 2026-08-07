import fs from "node:fs";
import { Router } from "express";
import { exigirAdmin, exigirLogin, gerarHash } from "../auth.js";
import { conhecimento, recarregar, resolverArquivo } from "../conhecimento.js";
import { acharUsuarioPorEmail, criarUsuario, listarUsuarios } from "../db.js";

export const rotasAdmin = Router();

rotasAdmin.use(exigirLogin, exigirAdmin);

/** Lista os arquivos editáveis da base e dos comandos. */
rotasAdmin.get("/arquivos", (req, res) => {
  const { base, comandos } = conhecimento();
  res.json({
    base: base.map((a) => a.arquivo),
    comandos: comandos.map((c) => ({ arquivo: c.arquivo, nome: c.nome, titulo: c.titulo })),
  });
});

rotasAdmin.get("/arquivos/:pasta/:arquivo", (req, res) => {
  const { pasta, arquivo } = req.params;
  if (pasta !== "base" && pasta !== "comandos") {
    res.status(400).json({ erro: "Pasta inválida" });
    return;
  }
  try {
    const caminho = resolverArquivo(pasta, arquivo);
    res.json({ arquivo, conteudo: fs.readFileSync(caminho, "utf8") });
  } catch (e: any) {
    res.status(400).json({ erro: e.message });
  }
});

rotasAdmin.put("/arquivos/:pasta/:arquivo", (req, res) => {
  const { pasta, arquivo } = req.params;
  const { conteudo } = req.body ?? {};

  if (pasta !== "base" && pasta !== "comandos") {
    res.status(400).json({ erro: "Pasta inválida" });
    return;
  }
  if (typeof conteudo !== "string") {
    res.status(400).json({ erro: "Conteúdo inválido" });
    return;
  }
  if (conteudo.length > 200_000) {
    res.status(400).json({ erro: "Arquivo grande demais (limite 200 mil caracteres)" });
    return;
  }

  try {
    const caminho = resolverArquivo(pasta, arquivo);
    if (!fs.existsSync(caminho)) {
      res.status(404).json({ erro: "Arquivo não existe" });
      return;
    }
    fs.writeFileSync(caminho, conteudo, "utf8");
    recarregar();
    console.log(`[admin] ${req.usuario!.email} editou ${pasta}/${arquivo}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ erro: e.message });
  }
});

rotasAdmin.post("/recarregar", (req, res) => {
  const k = recarregar();
  res.json({ base: k.base.length, comandos: k.comandos.length });
});

rotasAdmin.get("/usuarios", (req, res) => {
  res.json(
    listarUsuarios().map((u) => ({
      id: u.id,
      email: u.email,
      nome: u.nome,
      papel: u.papel,
      criadoEm: u.criadoEm,
    })),
  );
});

rotasAdmin.post("/usuarios", (req, res) => {
  const { email, nome, senha, papel } = req.body ?? {};

  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ erro: "E-mail inválido" });
    return;
  }
  if (typeof nome !== "string" || nome.trim().length < 2) {
    res.status(400).json({ erro: "Nome inválido" });
    return;
  }
  if (typeof senha !== "string" || senha.length < 8) {
    res.status(400).json({ erro: "A senha precisa ter pelo menos 8 caracteres" });
    return;
  }
  if (papel !== "admin" && papel !== "assessor") {
    res.status(400).json({ erro: "Papel deve ser admin ou assessor" });
    return;
  }
  if (acharUsuarioPorEmail(email)) {
    res.status(409).json({ erro: "Já existe usuário com esse e-mail" });
    return;
  }

  const usuario = criarUsuario({ email, nome: nome.trim(), papel, hashSenha: gerarHash(senha) });
  res.status(201).json({ id: usuario.id, email: usuario.email, nome: usuario.nome });
});
