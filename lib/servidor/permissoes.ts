import type { usuarios } from "@/db/schema";

// Regras de permissão do sistema real (servidor). Modelo horizontal: toda
// conta ativa faz tudo com tarefas. A única exceção é acesso — só o dono
// (coluna `dono`, o Ítalo) e quem ele autorizar (`gerencia_acessos`).
// Equivalente às regras do protótipo em lib/regras.ts, mas lendo o banco.

type Conta = Pick<typeof usuarios.$inferSelect, "id" | "ativo" | "dono" | "gerenciaAcessos">;

export function podeGerenciarAcessos(conta: Conta): boolean {
  return conta.ativo && (conta.dono || conta.gerenciaAcessos);
}

export function podeDelegarAcessos(conta: Conta): boolean {
  return conta.ativo && conta.dono;
}

export type MotivoRecusaAcesso = string;

// Pode `quem` remover (ou restaurar) o acesso de `alvo`? Devolve null se pode,
// ou o motivo da recusa.
export function recusaParaMexerNoAcesso(quem: Conta, alvo: Conta): MotivoRecusaAcesso | null {
  if (!podeGerenciarAcessos(quem)) return "Só o Ítalo e quem ele autorizar podem mexer em acessos.";
  if (alvo.dono) return "O acesso do Ítalo não pode ser removido.";
  if (alvo.id === quem.id) return "Você não pode remover o seu próprio acesso.";
  if (alvo.gerenciaAcessos && !quem.dono) return "Só o Ítalo mexe no acesso de quem também gerencia acessos.";
  return null;
}
