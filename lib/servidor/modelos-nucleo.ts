import { and, asc, eq, max } from "drizzle-orm";
import type { Banco } from "@/db";
import { checklistItens, eventosTarefa, frentes, modelosChecklist, tarefas } from "@/db/schema";
import type { Resultado } from "./tarefas-nucleo";

// D1 — modelos de checklist: listas de passos que se repetem (pré-evento,
// lançamento de aula, onboarding de aluna). Modelo horizontal: qualquer
// conta cria, usa e arquiva. Aplicar um modelo só acrescenta itens.

type Ator = { id: string };
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LIMITES_MODELO = { nome: 80, itens: 30, item: 200 };

export interface ModeloVisao {
  id: string;
  nome: string;
  itens: string[];
  frente: { id: string; nome: string } | null;
}

export async function listarModelos(banco: Banco): Promise<ModeloVisao[]> {
  const linhas = await banco
    .select({ id: modelosChecklist.id, nome: modelosChecklist.nome, itens: modelosChecklist.itens, frenteId: frentes.id, frenteNome: frentes.nome })
    .from(modelosChecklist)
    .leftJoin(frentes, eq(frentes.id, modelosChecklist.frenteId))
    .where(eq(modelosChecklist.ativo, true));
  // Ordem alfabética em português (acentos), independente da collation do banco.
  return linhas
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((l) => ({ id: l.id, nome: l.nome, itens: l.itens, frente: l.frenteId ? { id: l.frenteId, nome: l.frenteNome! } : null }));
}

export async function criarModelo(
  banco: Banco,
  ator: Ator,
  dados: { nome: string; itens: string[]; frenteId?: string | null }
): Promise<Resultado<{ id: string }>> {
  const nome = dados.nome.trim();
  const itens = dados.itens.map((x) => x.trim()).filter(Boolean);
  if (!nome) return { ok: false, motivo: "Dê um nome ao modelo." };
  if (nome.length > LIMITES_MODELO.nome) return { ok: false, motivo: `O nome pode ter até ${LIMITES_MODELO.nome} caracteres.` };
  if (!itens.length) return { ok: false, motivo: "O modelo precisa de pelo menos um item." };
  if (itens.length > LIMITES_MODELO.itens) return { ok: false, motivo: `O modelo pode ter até ${LIMITES_MODELO.itens} itens.` };
  if (itens.some((x) => x.length > LIMITES_MODELO.item)) return { ok: false, motivo: `Cada item pode ter até ${LIMITES_MODELO.item} caracteres.` };
  const frenteId = dados.frenteId && FORMATO_UUID.test(dados.frenteId) ? dados.frenteId : null;

  const r = await banco
    .insert(modelosChecklist)
    .values({ nome, itens, frenteId, criadoPorId: ator.id })
    .onConflictDoNothing()
    .returning({ id: modelosChecklist.id });
  if (!r.length) return { ok: false, motivo: `Já existe um modelo chamado "${nome}".` };
  return { ok: true, id: r[0].id };
}

export async function arquivarModelo(banco: Banco, id: string): Promise<Resultado> {
  if (!FORMATO_UUID.test(id)) return { ok: false, motivo: "Modelo não encontrado." };
  const r = await banco
    .update(modelosChecklist)
    .set({ ativo: false })
    .where(and(eq(modelosChecklist.id, id), eq(modelosChecklist.ativo, true)))
    .returning({ id: modelosChecklist.id });
  return r.length ? { ok: true } : { ok: false, motivo: "Modelo não encontrado." };
}

// Acrescenta ao checklist da tarefa os itens do modelo que ainda não estão lá.
export async function aplicarModelo(banco: Banco, ator: Ator, tarefaId: string, modeloId: string): Promise<Resultado<{ adicionados: number }>> {
  if (!FORMATO_UUID.test(tarefaId) || !FORMATO_UUID.test(modeloId)) return { ok: false, motivo: "Tarefa ou modelo não encontrado." };
  return banco.transaction(async (tx) => {
    const [t] = await tx.select({ estado: tarefas.estado }).from(tarefas).where(eq(tarefas.id, tarefaId)).limit(1);
    if (!t) return { ok: false, motivo: "Tarefa não encontrada." };
    if (t.estado === "arquivada") return { ok: false, motivo: "Tarefa arquivada." };
    const [m] = await tx.select().from(modelosChecklist).where(and(eq(modelosChecklist.id, modeloId), eq(modelosChecklist.ativo, true))).limit(1);
    if (!m) return { ok: false, motivo: "Modelo não encontrado." };

    const atuais = await tx.select({ texto: checklistItens.texto }).from(checklistItens).where(eq(checklistItens.tarefaId, tarefaId));
    const ja = new Set(atuais.map((a) => a.texto.trim().toLowerCase()));
    const novos = m.itens.filter((x) => !ja.has(x.trim().toLowerCase()));
    if (atuais.length + novos.length > 100) return { ok: false, motivo: "O checklist ficaria grande demais (máximo 100 itens)." };
    if (novos.length) {
      const [{ ultima }] = await tx.select({ ultima: max(checklistItens.ordem) }).from(checklistItens).where(eq(checklistItens.tarefaId, tarefaId));
      await tx.insert(checklistItens).values(novos.map((texto, i) => ({ tarefaId, texto, ordem: (ultima ?? 0) + i + 1 })));
    }
    await tx.insert(eventosTarefa).values({
      tarefaId,
      tipo: "checklist",
      atorId: ator.id,
      depois: `Aplicou o modelo "${m.nome}" (${novos.length} ${novos.length === 1 ? "item novo" : "itens novos"})`,
    });
    return { ok: true, adicionados: novos.length };
  });
}

// "Salvar como modelo": transforma o checklist de uma tarefa em modelo.
export async function modeloDaTarefa(banco: Banco, ator: Ator, tarefaId: string, nome: string): Promise<Resultado<{ id: string }>> {
  if (!FORMATO_UUID.test(tarefaId)) return { ok: false, motivo: "Tarefa não encontrada." };
  const [t] = await banco.select({ frenteId: tarefas.frenteId }).from(tarefas).where(eq(tarefas.id, tarefaId)).limit(1);
  if (!t) return { ok: false, motivo: "Tarefa não encontrada." };
  const itens = await banco
    .select({ texto: checklistItens.texto })
    .from(checklistItens)
    .where(eq(checklistItens.tarefaId, tarefaId))
    .orderBy(asc(checklistItens.ordem));
  return criarModelo(banco, ator, { nome, itens: itens.map((i) => i.texto), frenteId: t.frenteId });
}
