/**
 * Redefine a senha de um usuário existente.
 *   npm run redefinir-senha -- --email a@b.com --senha novasenha123
 */
import { gerarHash } from "../src/auth.js";
import { listarUsuarios, redefinirSenhaNoDisco } from "../src/db.js";

function flag(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const email = flag("email");
const senha = flag("senha");

if (!email || !senha) {
  console.error("\nUso: npm run redefinir-senha -- --email a@b.com --senha novasenha123\n");
  console.error("Cadastrados:", listarUsuarios().map((u) => u.email).join(", ") || "(nenhum)");
  console.error("");
  process.exit(1);
}

if (senha.length < 8) {
  console.error("A senha precisa ter pelo menos 8 caracteres.");
  process.exit(1);
}

if (!redefinirSenhaNoDisco(email, gerarHash(senha))) {
  console.error(`\nNão existe usuário com o e-mail "${email}".`);
  console.error("Cadastrados:", listarUsuarios().map((u) => u.email).join(", ") || "(nenhum)");
  console.error("");
  process.exit(1);
}

console.log(`\n✔ Senha de ${email.trim().toLowerCase()} redefinida.`);
console.log("  Já vale no login, sem precisar reiniciar o servidor.\n");
process.exit(0);
