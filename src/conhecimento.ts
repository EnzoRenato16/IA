import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export type EscolhaModelo = "padrao" | "rapido";

export interface Comando {
  nome: string;
  titulo: string;
  descricao: string;
  aceitaImagem: "obrigatoria" | "opcional" | "nao";
  /** "rapido" usa o modelo barato. Definido no frontmatter do comando. */
  modelo: EscolhaModelo;
  /** Sobrescreve EFFORT só para este comando. Ignorado pelo modelo rápido. */
  esforco?: string;
  instrucoes: string;
  arquivo: string;
}

export interface ArquivoBase {
  arquivo: string;
  conteudo: string;
}

interface Conhecimento {
  base: ArquivoBase[];
  comandos: Comando[];
  carregadoEm: Date;
}

/** Parser mínimo de frontmatter YAML (só chave: valor de uma linha). */
function separarFrontmatter(texto: string): { meta: Record<string, string>; corpo: string } {
  if (!texto.startsWith("---")) return { meta: {}, corpo: texto };
  const fim = texto.indexOf("\n---", 3);
  if (fim === -1) return { meta: {}, corpo: texto };

  const bloco = texto.slice(3, fim);
  const corpo = texto.slice(fim + 4).replace(/^\r?\n/, "");
  const meta: Record<string, string> = {};

  for (const linha of bloco.split("\n")) {
    if (linha.trim().startsWith("#")) continue; // comentário
    const sep = linha.indexOf(":");
    if (sep === -1) continue;
    const chave = linha.slice(0, sep).trim();
    const valor = linha
      .slice(sep + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (chave) meta[chave] = valor;
  }
  return { meta, corpo };
}

function lerMarkdowns(dir: string): { arquivo: string; texto: string }[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((arquivo) => ({
      arquivo,
      texto: fs.readFileSync(path.join(dir, arquivo), "utf8"),
    }));
}

function carregar(): Conhecimento {
  const base = lerMarkdowns(config.dirBase).map(({ arquivo, texto }) => ({
    arquivo,
    conteudo: texto,
  }));

  const comandos = lerMarkdowns(config.dirComandos).map(({ arquivo, texto }) => {
    const { meta, corpo } = separarFrontmatter(texto);
    const aceita = meta.aceita_imagem;
    return {
      nome: (meta.nome ?? arquivo.replace(/\.md$/, "")).toLowerCase(),
      titulo: meta.titulo ?? arquivo,
      descricao: meta.descricao ?? "",
      aceitaImagem:
        aceita === "obrigatoria" || aceita === "opcional" || aceita === "nao"
          ? aceita
          : "opcional",
      modelo: meta.modelo === "rapido" ? "rapido" : "padrao",
      esforco: meta.esforco || undefined,
      instrucoes: corpo.trim(),
      arquivo,
    } satisfies Comando;
  });

  return { base, comandos, carregadoEm: new Date() };
}

let cache = carregar();

export function conhecimento(): Conhecimento {
  return cache;
}

export function recarregar(): Conhecimento {
  cache = carregar();
  console.log(
    `[conhecimento] recarregado: ${cache.base.length} arquivos de base, ${cache.comandos.length} comandos`,
  );
  return cache;
}

export function acharComando(nome: string): Comando | undefined {
  return cache.comandos.find((c) => c.nome === nome.toLowerCase());
}

/**
 * Resolve um comando a partir do texto digitado.
 * "/print olha isso" -> { comando: print, texto: "olha isso" }
 */
export function extrairComando(texto: string): { comando?: Comando; texto: string } {
  const m = texto.match(/^\/([\p{L}\d_-]+)\s*([\s\S]*)$/u);
  if (!m) return { texto };
  const comando = acharComando(m[1]);
  if (!comando) return { texto };
  return { comando, texto: m[2].trim() };
}

// --- leitura/escrita segura de arquivos (para a tela de administração) ---

const NOME_VALIDO = /^[a-z0-9][a-z0-9._-]*\.md$/i;

export function resolverArquivo(pasta: "base" | "comandos", arquivo: string): string {
  if (!NOME_VALIDO.test(arquivo)) {
    throw new Error("Nome de arquivo inválido");
  }
  const dir = pasta === "base" ? config.dirBase : config.dirComandos;
  const alvo = path.resolve(dir, arquivo);
  // Defesa contra path traversal: o caminho resolvido tem que continuar dentro da pasta.
  if (path.dirname(alvo) !== path.resolve(dir)) {
    throw new Error("Caminho fora da pasta permitida");
  }
  return alvo;
}
