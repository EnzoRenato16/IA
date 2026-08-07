import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { acharUsuario, type Usuario } from "./db.js";

const NOME_COOKIE = "sessao";
const DURACAO_MS = 1000 * 60 * 60 * 12; // 12 horas

// ---------- senhas (scrypt, sem dependência nativa) ----------

export function gerarHash(senha: string): string {
  const sal = crypto.randomBytes(16);
  const derivada = crypto.scryptSync(senha.normalize("NFKC"), sal, 64);
  return `scrypt$${sal.toString("hex")}$${derivada.toString("hex")}`;
}

export function conferirSenha(senha: string, hash: string): boolean {
  const partes = hash.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const sal = Buffer.from(partes[1], "hex");
  const esperado = Buffer.from(partes[2], "hex");
  const derivada = crypto.scryptSync(senha.normalize("NFKC"), sal, esperado.length);
  return crypto.timingSafeEqual(derivada, esperado);
}

// ---------- sessão em cookie assinado ----------

function assinar(dados: string): string {
  return crypto.createHmac("sha256", config.segredoSessao).update(dados).digest("base64url");
}

export function criarSessao(res: Response, usuario: Usuario): void {
  const payload = Buffer.from(
    JSON.stringify({ uid: usuario.id, exp: Date.now() + DURACAO_MS }),
  ).toString("base64url");
  const token = `${payload}.${assinar(payload)}`;
  res.cookie(NOME_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DURACAO_MS,
  });
}

export function encerrarSessao(res: Response): void {
  res.clearCookie(NOME_COOKIE);
}

function lerCookie(req: Request): string | undefined {
  const bruto = req.headers.cookie;
  if (!bruto) return undefined;
  for (const parte of bruto.split(";")) {
    const [nome, ...resto] = parte.trim().split("=");
    if (nome === NOME_COOKIE) return decodeURIComponent(resto.join("="));
  }
  return undefined;
}

export function usuarioDaRequisicao(req: Request): Usuario | undefined {
  const token = lerCookie(req);
  if (!token) return undefined;

  const corte = token.lastIndexOf(".");
  if (corte === -1) return undefined;

  const payload = token.slice(0, corte);
  const assinatura = token.slice(corte + 1);

  const esperada = Buffer.from(assinar(payload));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length) return undefined;
  if (!crypto.timingSafeEqual(esperada, recebida)) return undefined;

  try {
    const dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof dados.exp !== "number" || dados.exp < Date.now()) return undefined;
    return acharUsuario(dados.uid);
  } catch {
    return undefined;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: Usuario;
    }
  }
}

export function exigirLogin(req: Request, res: Response, next: NextFunction): void {
  const usuario = usuarioDaRequisicao(req);
  if (!usuario) {
    res.status(401).json({ erro: "Não autenticado" });
    return;
  }
  req.usuario = usuario;
  next();
}

export function exigirAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.usuario?.papel !== "admin") {
    res.status(403).json({ erro: "Só administradores podem fazer isso" });
    return;
  }
  next();
}
