import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export type Papel = "admin" | "assessor";

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  hashSenha: string;
  criadoEm: string;
}

export interface Mensagem {
  papel: "user" | "assistant";
  texto: string;
  comando?: string;
  /** Quantidade de imagens anexadas (as imagens em si não são persistidas). */
  imagens?: number;
  em: string;
}

export interface Conversa {
  id: string;
  usuarioId: string;
  titulo: string;
  mensagens: Mensagem[];
  criadaEm: string;
  atualizadaEm: string;
}

interface Banco {
  usuarios: Usuario[];
  conversas: Conversa[];
}

const vazio: Banco = { usuarios: [], conversas: [] };

function carregar(): Banco {
  try {
    const bruto = fs.readFileSync(config.arquivoDb, "utf8");
    const dados = JSON.parse(bruto) as Partial<Banco>;
    return { usuarios: dados.usuarios ?? [], conversas: dados.conversas ?? [] };
  } catch {
    return structuredClone(vazio);
  }
}

const banco: Banco = carregar();

let salvamentoPendente: NodeJS.Timeout | null = null;

/**
 * Traz para a memória usuários que foram criados por outro processo — é o caso do
 * script `npm run criar-usuario` rodando com o servidor no ar. Sem isso, o servidor
 * não veria o usuário novo e o sobrescreveria no próximo salvamento.
 */
function sincronizarUsuarios(): void {
  const doDisco = carregar().usuarios;
  const conhecidos = new Set(banco.usuarios.map((u) => u.id));
  for (const u of doDisco) {
    if (!conhecidos.has(u.id)) banco.usuarios.push(u);
  }
}

/** Escrita atômica (grava em .tmp e renomeia) para não corromper o arquivo. */
function gravarAgora(): void {
  sincronizarUsuarios();
  fs.mkdirSync(path.dirname(config.arquivoDb), { recursive: true });
  const tmp = `${config.arquivoDb}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(banco, null, 2), "utf8");
  fs.renameSync(tmp, config.arquivoDb);
}

export function salvar(): void {
  if (salvamentoPendente) clearTimeout(salvamentoPendente);
  salvamentoPendente = setTimeout(() => {
    salvamentoPendente = null;
    try {
      gravarAgora();
    } catch (e) {
      console.error("[db] falha ao salvar:", e);
    }
  }, 150);
}

process.on("exit", () => {
  if (salvamentoPendente) {
    clearTimeout(salvamentoPendente);
    try {
      gravarAgora();
    } catch {
      /* nada a fazer no exit */
    }
  }
});

// ---------- usuários ----------

export function listarUsuarios(): Usuario[] {
  return banco.usuarios;
}

export function acharUsuarioPorEmail(email: string): Usuario | undefined {
  const alvo = email.trim().toLowerCase();
  const achado = banco.usuarios.find((u) => u.email === alvo);
  if (achado) return achado;

  // Não achou: pode ter sido criado por outro processo depois que o servidor subiu.
  sincronizarUsuarios();
  return banco.usuarios.find((u) => u.email === alvo);
}

export function acharUsuario(id: string): Usuario | undefined {
  return banco.usuarios.find((u) => u.id === id);
}

export function criarUsuario(dados: {
  email: string;
  nome: string;
  papel: Papel;
  hashSenha: string;
}): Usuario {
  const usuario: Usuario = {
    id: randomUUID(),
    email: dados.email.trim().toLowerCase(),
    nome: dados.nome,
    papel: dados.papel,
    hashSenha: dados.hashSenha,
    criadoEm: new Date().toISOString(),
  };
  banco.usuarios.push(usuario);
  salvar();
  return usuario;
}

// ---------- conversas ----------

export function listarConversas(usuarioId: string): Conversa[] {
  return banco.conversas
    .filter((c) => c.usuarioId === usuarioId)
    .sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm));
}

export function acharConversa(id: string, usuarioId: string): Conversa | undefined {
  return banco.conversas.find((c) => c.id === id && c.usuarioId === usuarioId);
}

export function criarConversa(usuarioId: string, titulo: string): Conversa {
  const agora = new Date().toISOString();
  const conversa: Conversa = {
    id: randomUUID(),
    usuarioId,
    titulo,
    mensagens: [],
    criadaEm: agora,
    atualizadaEm: agora,
  };
  banco.conversas.push(conversa);
  salvar();
  return conversa;
}

export function apagarConversa(id: string, usuarioId: string): boolean {
  const i = banco.conversas.findIndex((c) => c.id === id && c.usuarioId === usuarioId);
  if (i === -1) return false;
  banco.conversas.splice(i, 1);
  salvar();
  return true;
}
