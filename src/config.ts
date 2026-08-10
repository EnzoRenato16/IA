import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Sobe a partir deste arquivo até achar o package.json.
 * Assim `base/`, `comandos/`, `data/` e `public/` são encontrados tanto rodando
 * o TypeScript direto (src/) quanto o build (dist/src/).
 */
function acharRaiz(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const pai = path.dirname(dir);
    if (pai === dir) break;
    dir = pai;
  }
  return process.cwd();
}

export const RAIZ = acharRaiz();

function obrigatorio(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    console.error(`\n[erro] variável de ambiente ${nome} não definida.`);
    console.error(`Copie .env.example para .env e preencha.\n`);
    process.exit(1);
  }
  return v;
}

/** "anthropic" = API direta da Anthropic. "bedrock" = AWS Bedrock. */
const provider = (process.env.PROVIDER ?? "anthropic").toLowerCase();
if (provider !== "anthropic" && provider !== "bedrock") {
  console.error(`[erro] PROVIDER deve ser "anthropic" ou "bedrock" (recebi "${provider}").`);
  process.exit(1);
}

/** No Bedrock os IDs levam prefixo "anthropic.". Aplicado automaticamente. */
function idModelo(id: string): string {
  return provider === "bedrock" && !id.startsWith("anthropic.") ? `anthropic.${id}` : id;
}

export const config = {
  provider: provider as "anthropic" | "bedrock",

  /** Modelo forte: raciocínio, visão, compliance. */
  modelo: idModelo(process.env.MODEL ?? "claude-opus-5"),

  /** Modelo barato para tarefas simples. ~5x mais baixo que o Opus. */
  modeloRapido: idModelo(process.env.MODEL_RAPIDO ?? "claude-haiku-4-5"),

  // AWS_REGION é lido pelo próprio SDK, mas exigimos explícito para falhar cedo.
  awsRegion: process.env.AWS_REGION ?? "us-east-1",

  esforco: (process.env.EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max",
  maxTokens: Number(process.env.MAX_TOKENS ?? 8000),

  porta: Number(process.env.PORT ?? 3000),
  segredoSessao: obrigatorio("SESSION_SECRET"),
  nomeAssessoria: process.env.NOME_ASSESSORIA ?? "Assessoria",

  dirBase: path.join(RAIZ, "base"),
  dirComandos: path.join(RAIZ, "comandos"),
  arquivoDb: path.join(RAIZ, "data", "db.json"),
  dirPublico: path.join(RAIZ, "public"),
};

if (config.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
  console.error("\n[erro] PROVIDER=anthropic exige ANTHROPIC_API_KEY no .env\n");
  process.exit(1);
}
