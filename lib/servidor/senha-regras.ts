// Regras de senha sem dependências: usadas no formulário (navegador) e no
// servidor. O hash fica em senha.ts, que usa node:crypto e não vai pro navegador.

export const SENHA_MINIMA = 10;

export function problemaNaSenha(senha: string): string | null {
  if (senha.length < SENHA_MINIMA) return `Use pelo menos ${SENHA_MINIMA} caracteres.`;
  if (senha.length > 200) return "Senha longa demais.";
  if (/^(.)\1+$/.test(senha)) return "Não use o mesmo caractere repetido.";
  return null;
}
