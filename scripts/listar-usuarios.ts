/**
 * Mostra os usuários cadastrados (sem revelar senhas).
 *   npm run listar-usuarios
 */
import { listarUsuarios } from "../src/db.js";

const usuarios = listarUsuarios();

if (usuarios.length === 0) {
  console.log("\nNenhum usuário cadastrado. Rode:  npm run criar-usuario\n");
  process.exit(0);
}

console.log(`\n${usuarios.length} usuário(s) cadastrado(s):\n`);
for (const u of usuarios) {
  console.log(`  ${u.email}`);
  console.log(`    nome: ${u.nome}  ·  papel: ${u.papel}`);
}
console.log(
  "\nO e-mail do login precisa ser exatamente um destes (maiúsculas não importam).\n",
);
process.exit(0);
