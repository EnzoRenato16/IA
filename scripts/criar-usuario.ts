/**
 * Cria um usuário pela linha de comando.
 *   npm run criar-usuario
 *   npm run criar-usuario -- --email a@b.com --nome "Fulano" --senha segredo123 --papel admin
 */
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { gerarHash } from "../src/auth.js";
import { acharUsuarioPorEmail, criarUsuario, listarUsuarios } from "../src/db.js";

function flag(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const rl = readline.createInterface({ input: stdin, output: stdout });

async function perguntar(rotulo: string, padrao?: string): Promise<string> {
  const r = (await rl.question(padrao ? `${rotulo} [${padrao}]: ` : `${rotulo}: `)).trim();
  return r || padrao || "";
}

const primeiro = listarUsuarios().length === 0;

const email = flag("email") ?? (await perguntar("E-mail"));
const nome = flag("nome") ?? (await perguntar("Nome"));
const senha = flag("senha") ?? (await perguntar("Senha (mín. 8 caracteres)"));
const papel = flag("papel") ?? (await perguntar("Papel (admin/assessor)", primeiro ? "admin" : "assessor"));

rl.close();

if (!email.includes("@")) {
  console.error("E-mail inválido.");
  process.exit(1);
}
if (senha.length < 8) {
  console.error("Senha precisa ter pelo menos 8 caracteres.");
  process.exit(1);
}
if (papel !== "admin" && papel !== "assessor") {
  console.error('Papel precisa ser "admin" ou "assessor".');
  process.exit(1);
}
if (acharUsuarioPorEmail(email)) {
  console.error("Já existe usuário com esse e-mail.");
  process.exit(1);
}

const usuario = criarUsuario({ email, nome, papel, hashSenha: gerarHash(senha) });
console.log(`\n✔ Usuário criado: ${usuario.nome} <${usuario.email}> (${usuario.papel})\n`);
process.exit(0);
