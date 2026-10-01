import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosAcesso, eventosTarefa, mensagens, tarefas, usuarios } from "@/db/schema";
import { podeDelegarAcessos, recusaParaMexerNoAcesso } from "./permissoes";

// A5 — acessos no servidor. Mesmas regras do protótipo, agora numa transação
// e com auditoria. Remover NÃO apaga a conta: o histórico continua e o
// acesso pode ser restaurado. O trigger do banco encerra as sessões.

type Conta = typeof usuarios.$inferSelect;
export type Resultado = { ok: true } | { ok: false; motivo: string };

async function buscar(banco: Banco, id: string): Promise<Conta | undefined> {
  const [c] = await banco.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
  return c;
}

export async function removerAcesso(
  banco: Banco,
  quem: Conta,
  alvoId: string,
  motivo: string,
  agora = new Date()
): Promise<Resultado> {
  const alvo = await buscar(banco, alvoId);
  if (!alvo) return { ok: false, motivo: "Conta não encontrada." };
  if (!alvo.ativo) return { ok: false, motivo: "Essa conta já está sem acesso." };
  const recusa = recusaParaMexerNoAcesso(quem, alvo);
  if (recusa) return { ok: false, motivo: recusa };
  const detalhe = `Acesso de ${alvo.nome} removido por ${quem.nome}${motivo.trim() ? `: ${motivo.trim()}` : ""}`;

  await banco.transaction(async (tx) => {
    await tx
      .update(usuarios)
      .set({ ativo: false, gerenciaAcessos: false, acessoRemovidoEm: agora, acessoRemovidoPorId: quem.id })
      .where(eq(usuarios.id, alvo.id));

    // Tarefas abertas da pessoa voltam para a triagem, sem dono.
    const abertas = await tx
      .update(tarefas)
      .set({ responsavelId: null, estado: "triagem", estadoAnterior: null, motivoBloqueio: null, atualizadoEm: agora })
      .where(and(eq(tarefas.responsavelId, alvo.id), notInArray(tarefas.estado, ["concluida", "arquivada"])))
      .returning({ id: tarefas.id });
    if (abertas.length) {
      await tx.insert(eventosTarefa).values(
        abertas.map((t) => ({
          tarefaId: t.id,
          tipo: "acesso" as const,
          atorId: quem.id,
          antes: alvo.nome,
          depois: `${detalhe}. A tarefa voltou para a triagem.`,
          criadoEm: agora,
        }))
      );
    }

    // Mensagens que ainda iam sair para a pessoa não saem mais.
    await tx
      .update(mensagens)
      .set({ status: "ignorado", motivo: "Essa pessoa não tem mais acesso ao sistema" })
      .where(and(eq(mensagens.destinatarioId, alvo.id), inArray(mensagens.status, ["pendente", "enviando"])));

    await tx.insert(eventosAcesso).values({
      tipo: "acesso_removido",
      atorId: quem.id,
      alvoId: alvo.id,
      motivo: motivo.trim() || null,
      detalhes: { tarefasParaTriagem: abertas.length },
      criadoEm: agora,
    });
  });
  return { ok: true };
}

export async function restaurarAcesso(banco: Banco, quem: Conta, alvoId: string, agora = new Date()): Promise<Resultado> {
  const alvo = await buscar(banco, alvoId);
  if (!alvo) return { ok: false, motivo: "Conta não encontrada." };
  if (alvo.ativo) return { ok: false, motivo: "Essa conta já tem acesso." };
  // Para restaurar valem as mesmas regras de quem pode mexer em acessos
  // (o alvo inativo nunca é gestor: a permissão cai ao remover).
  const recusa = recusaParaMexerNoAcesso(quem, alvo);
  if (recusa) return { ok: false, motivo: recusa };

  await banco.transaction(async (tx) => {
    await tx
      .update(usuarios)
      .set({ ativo: true, acessoRemovidoEm: null, acessoRemovidoPorId: null })
      .where(eq(usuarios.id, alvo.id));
    await tx.insert(eventosAcesso).values({ tipo: "acesso_restaurado", atorId: quem.id, alvoId: alvo.id, criadoEm: agora });
  });
  return { ok: true };
}

export async function definirGerenciaAcessos(
  banco: Banco,
  quem: Conta,
  alvoId: string,
  pode: boolean,
  agora = new Date()
): Promise<Resultado> {
  if (!podeDelegarAcessos(quem)) return { ok: false, motivo: "Só o Ítalo decide quem mais pode gerenciar acessos." };
  const alvo = await buscar(banco, alvoId);
  if (!alvo) return { ok: false, motivo: "Conta não encontrada." };
  if (alvo.dono) return { ok: false, motivo: "O dono sempre gerencia acessos." };
  if (!alvo.ativo) return { ok: false, motivo: "Restaure o acesso da pessoa antes." };
  if (alvo.gerenciaAcessos === pode) return { ok: true };

  await banco.transaction(async (tx) => {
    await tx.update(usuarios).set({ gerenciaAcessos: pode }).where(eq(usuarios.id, alvo.id));
    await tx.insert(eventosAcesso).values({
      tipo: pode ? "permissao_dada" : "permissao_retirada",
      atorId: quem.id,
      alvoId: alvo.id,
      criadoEm: agora,
    });
  });
  return { ok: true };
}

// "Seus dados": cada pessoa edita só os próprios nome, função e WhatsApp.
export async function atualizarMeusDados(
  banco: Banco,
  conta: Conta,
  dados: { nome: string; funcao: string; telefoneWhatsapp: string }
): Promise<Resultado> {
  const nome = dados.nome.trim().slice(0, 80);
  const funcao = dados.funcao.trim().slice(0, 80);
  const telefone = dados.telefoneWhatsapp.trim().slice(0, 30);
  if (!nome) return { ok: false, motivo: "Informe o nome." };
  if (telefone && !/^\+?[\d\s()-]{10,}$/.test(telefone)) {
    return { ok: false, motivo: "WhatsApp com DDD, por exemplo +55 81 99999-0000." };
  }
  await banco.update(usuarios).set({ nome, funcao, telefoneWhatsapp: telefone }).where(eq(usuarios.id, conta.id));
  return { ok: true };
}
