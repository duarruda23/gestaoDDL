import { and, eq, inArray, max } from "drizzle-orm";
import type { Banco } from "@/db";
import { checklistItens, comentarios, eventosTarefa, frentes, tarefaEnvolvidos, tarefas, usuarios } from "@/db/schema";
import type { Estado, Prioridade } from "@/lib/types";
import { pendenciasParaLiberar, transicoesPermitidas } from "@/lib/regras";
import { CONFLITO } from "@/lib/conflito";
import { descreverPrazo, hojeISO } from "@/lib/datas";
import { enfileirar, primeiroNome } from "./fila";

// A7 — escrita de tarefas no servidor. Modelo horizontal: qualquer conta
// ativa pode pedir, editar, mudar etapa, comentar e mexer no checklist de
// qualquer tarefa. O que fica registrado é quem fez (eventos_tarefa, que o
// banco não deixa alterar nem apagar).
//
// Concorrência otimista (spec, seção 10): edição e mudança de etapa levam a
// versão que a pessoa viu; se outra pessoa salvou antes, a alteração é
// recusada em vez de sobrescrever. Comentário e checklist não disputam versão.

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; motivo: string };
type Ator = { id: string };
export type Tx = Parameters<Parameters<Banco["transaction"]>[0]>[0];

export { CONFLITO };
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const PRIORIDADES: Prioridade[] = ["baixa", "media", "alta", "urgente"];

export const LIMITES = { titulo: 200, descricao: 5000, comentario: 2000, item: 200, motivo: 300, itensNaCriacao: 30 };

export interface DadosTarefa {
  titulo: string;
  descricao: string;
  responsavelId: string | null;
  prazo: string | null;
  frenteId: string | null;
  prioridade: Prioridade;
}

function dataValida(iso: string): boolean {
  if (!FORMATO_DATA.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// Confere o que veio do formulário e resolve os nomes para o histórico.
async function validarCampos(
  tx: Tx | Banco,
  d: Partial<DadosTarefa>
): Promise<{ ok: false; motivo: string } | { ok: true; nomeResponsavel: string | null }> {
  if (d.titulo !== undefined) {
    if (!d.titulo.trim()) return { ok: false, motivo: "Dê um título para a tarefa." };
    if (d.titulo.length > LIMITES.titulo) return { ok: false, motivo: `O título pode ter até ${LIMITES.titulo} caracteres.` };
  }
  if (d.descricao !== undefined && d.descricao.length > LIMITES.descricao)
    return { ok: false, motivo: `A descrição pode ter até ${LIMITES.descricao} caracteres.` };
  if (d.prioridade !== undefined && !PRIORIDADES.includes(d.prioridade)) return { ok: false, motivo: "Prioridade inválida." };
  if (d.prazo && !dataValida(d.prazo)) return { ok: false, motivo: "Prazo inválido." };

  let nomeResponsavel: string | null = null;
  if (d.responsavelId) {
    if (!FORMATO_UUID.test(d.responsavelId)) return { ok: false, motivo: "Responsável inválido." };
    const [p] = await tx
      .select({ nome: usuarios.nome, ativo: usuarios.ativo })
      .from(usuarios)
      .where(eq(usuarios.id, d.responsavelId))
      .limit(1);
    if (!p) return { ok: false, motivo: "Responsável não encontrado." };
    if (!p.ativo) return { ok: false, motivo: `${p.nome} está sem acesso ao sistema; escolha outra pessoa.` };
    nomeResponsavel = p.nome;
  }
  if (d.frenteId) {
    if (!FORMATO_UUID.test(d.frenteId)) return { ok: false, motivo: "Frente inválida." };
    const [f] = await tx.select({ ativa: frentes.ativa }).from(frentes).where(eq(frentes.id, d.frenteId)).limit(1);
    if (!f || !f.ativa) return { ok: false, motivo: "Frente não encontrada." };
  }
  return { ok: true, nomeResponsavel };
}

async function nomeDe(tx: Tx, id: string | null): Promise<string | null> {
  if (!id) return null;
  const [p] = await tx.select({ nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, id)).limit(1);
  return p?.nome ?? null;
}

// Aviso de atribuição no WhatsApp (bloco C): sai quando a tarefa chega a
// alguém já liberada — criada completa, liberada da triagem ou passada para
// outra pessoa. Quem passou a tarefa para si mesmo não é avisado.
async function avisarAtribuicao(
  tx: Tx,
  t: { id: string; titulo: string; prazo: string | null; criadorId: string },
  responsavelId: string,
  atorId: string
) {
  if (responsavelId === atorId) return;
  const hoje = hojeISO();
  const [ator, criador, dest] = await Promise.all([nomeDe(tx, atorId), nomeDe(tx, t.criadorId), nomeDe(tx, responsavelId)]);
  const prazo = `Prazo: ${descreverPrazo(t.prazo, hoje).toLowerCase()}.`;
  const quem =
    atorId === t.criadorId
      ? `${primeiroNome(ator ?? "")} te pediu: *${t.titulo}*.`
      : `${primeiroNome(ator ?? "")} te passou: *${t.titulo}* (pedido de ${primeiroNome(criador ?? "")}).`;
  await enfileirar(
    tx,
    {
      chave: `${t.id}|atribuicao|${hoje}|${responsavelId}`,
      tarefaId: t.id,
      regra: "atribuicao",
      autorId: atorId,
      destinatarioId: responsavelId,
      texto: `Oi, ${primeiroNome(dest ?? "")}! ${quem} ${prazo}`,
    },
    hoje
  );
}

// Lê a tarefa travando a linha até o fim da transação.
async function travar(tx: Tx, id: string) {
  if (!FORMATO_UUID.test(id)) return undefined;
  const [t] = await tx.select().from(tarefas).where(eq(tarefas.id, id)).for("update").limit(1);
  return t;
}

// ---- Criar ----

export interface OpcoesCriacao {
  origem?: "manual" | "ia";
  pedidoId?: string | null; // pedido em texto livre que originou (bloco B)
  envolvidosIds?: string[]; // outras pessoas citadas no pedido
}

// Versão que roda dentro de uma transação já aberta: a confirmação da
// proposta da IA cria a tarefa e marca a proposta na mesma transação.
export async function criarTarefaTx(
  tx: Tx,
  ator: Ator,
  dados: DadosTarefa & { itens?: string[] },
  opcoes: OpcoesCriacao = {}
): Promise<Resultado<{ id: string; estado: Estado }>> {
  const v = await validarCampos(tx, dados);
  if (!v.ok) return v;
  const itens = (dados.itens ?? []).map((x) => x.trim()).filter(Boolean);
  if (itens.length > LIMITES.itensNaCriacao) return { ok: false, motivo: `O checklist pode começar com até ${LIMITES.itensNaCriacao} itens.` };
  if (itens.some((x) => x.length > LIMITES.item)) return { ok: false, motivo: `Cada item do checklist pode ter até ${LIMITES.item} caracteres.` };

  // Só quem está ativo pode ser citado; o responsável não se repete.
  let envolvidos = [...new Set(opcoes.envolvidosIds ?? [])].filter((id) => FORMATO_UUID.test(id) && id !== dados.responsavelId).slice(0, 20);
  if (envolvidos.length) {
    const ativos = await tx.select({ id: usuarios.id }).from(usuarios).where(and(inArray(usuarios.id, envolvidos), eq(usuarios.ativo, true)));
    const ok = new Set(ativos.map((a) => a.id));
    envolvidos = envolvidos.filter((id) => ok.has(id));
  }

  // Com responsável, prazo e frente, já nasce liberada; senão, vai pra triagem.
  const estado: Estado = pendenciasParaLiberar(dados).length === 0 ? "a_fazer" : "triagem";
  const origem = opcoes.origem ?? "manual";

  const [t] = await tx
    .insert(tarefas)
    .values({
      titulo: dados.titulo.trim(),
      descricao: dados.descricao.trim(),
      responsavelId: dados.responsavelId,
      prazo: dados.prazo,
      frenteId: dados.frenteId,
      prioridade: dados.prioridade,
      criadorId: ator.id,
      estado,
      origem,
      pedidoId: opcoes.pedidoId ?? null,
    })
    .returning({ id: tarefas.id });
  if (itens.length) await tx.insert(checklistItens).values(itens.map((texto, i) => ({ tarefaId: t.id, texto, ordem: i + 1 })));
  if (envolvidos.length) await tx.insert(tarefaEnvolvidos).values(envolvidos.map((usuarioId) => ({ tarefaId: t.id, usuarioId })));
  const como = origem === "ia" ? "Pedida em texto livre, interpretada pela IA e revisada" : "Pedida manualmente";
  await tx.insert(eventosTarefa).values({
    tarefaId: t.id,
    tipo: origem === "ia" ? "confirmada_ia" : "criada",
    atorId: ator.id,
    depois: estado === "triagem" ? `${como} (foi pra triagem)` : como,
  });
  if (estado === "a_fazer")
    await avisarAtribuicao(tx, { id: t.id, titulo: dados.titulo.trim(), prazo: dados.prazo, criadorId: ator.id }, dados.responsavelId!, ator.id);
  return { ok: true, id: t.id, estado };
}

export async function criarTarefa(
  banco: Banco,
  ator: Ator,
  dados: DadosTarefa & { itens?: string[] },
  opcoes: OpcoesCriacao = {}
): Promise<Resultado<{ id: string; estado: Estado }>> {
  return banco.transaction((tx) => criarTarefaTx(tx, ator, dados, opcoes));
}

// ---- Editar ----

export async function editarTarefa(
  banco: Banco,
  ator: Ator,
  id: string,
  versaoVista: number,
  edicao: Partial<DadosTarefa>
): Promise<Resultado<{ versao: number }>> {
  return banco.transaction(async (tx) => {
    const atual = await travar(tx, id);
    if (!atual) return { ok: false, motivo: "Tarefa não encontrada." };
    if (atual.versao !== versaoVista) return { ok: false, motivo: CONFLITO };
    if (atual.estado === "arquivada") return { ok: false, motivo: "Tarefa arquivada. Desfaça o arquivamento antes de editar." };

    // Só compara o que mudou de fato: um campo igual não é validado de novo
    // (ex.: responsável que perdeu o acesso continua lá até alguém trocar).
    const alteracoes: Partial<DadosTarefa> = {};
    for (const k of ["titulo", "descricao", "responsavelId", "prazo", "frenteId", "prioridade"] as const) {
      let valor = edicao[k];
      if (valor === undefined) continue;
      if ((k === "titulo" || k === "descricao") && typeof valor === "string") valor = valor.trim();
      if (valor !== atual[k]) Object.assign(alteracoes, { [k]: valor });
    }
    if (Object.keys(alteracoes).length === 0) return { ok: true, versao: atual.versao };

    const v = await validarCampos(tx, alteracoes);
    if (!v.ok) return v;

    const depois = { ...atual, ...alteracoes };
    if (!["triagem", "concluida"].includes(atual.estado) && pendenciasParaLiberar(depois).length > 0)
      return { ok: false, motivo: "Uma tarefa em execução precisa manter responsável, prazo e frente." };

    const [salva] = await tx
      .update(tarefas)
      .set({ ...alteracoes, versao: atual.versao + 1, atualizadoEm: new Date() })
      .where(and(eq(tarefas.id, id), eq(tarefas.versao, versaoVista)))
      .returning({ versao: tarefas.versao });
    if (!salva) return { ok: false, motivo: CONFLITO };

    const eventos: (typeof eventosTarefa.$inferInsert)[] = [];
    if (alteracoes.responsavelId !== undefined)
      eventos.push({ tarefaId: id, tipo: "responsavel", atorId: ator.id, antes: await nomeDe(tx, atual.responsavelId), depois: v.nomeResponsavel });
    if (alteracoes.prazo !== undefined) eventos.push({ tarefaId: id, tipo: "prazo", atorId: ator.id, antes: atual.prazo, depois: alteracoes.prazo });
    if (alteracoes.prioridade !== undefined)
      eventos.push({ tarefaId: id, tipo: "prioridade", atorId: ator.id, antes: atual.prioridade, depois: alteracoes.prioridade });
    if (eventos.length) await tx.insert(eventosTarefa).values(eventos);
    if (alteracoes.responsavelId && !["triagem", "concluida"].includes(atual.estado))
      await avisarAtribuicao(tx, { ...atual, titulo: depois.titulo, prazo: depois.prazo }, alteracoes.responsavelId, ator.id);
    return { ok: true, versao: salva.versao };
  });
}

// ---- Etapas ----

export async function mudarEtapa(
  banco: Banco,
  ator: Ator,
  id: string,
  versaoVista: number,
  para: Estado,
  motivo = ""
): Promise<Resultado<{ versao: number }>> {
  return banco.transaction(async (tx) => {
    const atual = await travar(tx, id);
    if (!atual) return { ok: false, motivo: "Tarefa não encontrada." };
    if (atual.versao !== versaoVista) return { ok: false, motivo: CONFLITO };

    const [frente] = atual.frenteId
      ? await tx.select({ usaRevisao: frentes.usaRevisao }).from(frentes).where(eq(frentes.id, atual.frenteId)).limit(1)
      : [];
    if (!transicoesPermitidas(atual, frente).includes(para)) return { ok: false, motivo: "Essa mudança de etapa não é possível agora." };

    const motivoLimpo = motivo.trim();
    if (para === "bloqueada") {
      if (!motivoLimpo) return { ok: false, motivo: "Informe o motivo do bloqueio." };
      if (motivoLimpo.length > LIMITES.motivo) return { ok: false, motivo: `O motivo pode ter até ${LIMITES.motivo} caracteres.` };
    }
    if (atual.estado === "triagem") {
      const faltas = pendenciasParaLiberar(atual);
      if (faltas.length) return { ok: false, motivo: `Defina ${faltas.join(", ")} antes de liberar.` };
      // Quem ia receber a tarefa pode ter perdido o acesso enquanto ela estava na triagem.
      const [resp] = await tx.select({ ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, atual.responsavelId!)).limit(1);
      if (!resp?.ativo) return { ok: false, motivo: "O responsável está sem acesso ao sistema; escolha outra pessoa." };
    }

    const bloqueando = para === "bloqueada";
    const [salva] = await tx
      .update(tarefas)
      .set({
        estado: para,
        estadoAnterior: bloqueando ? atual.estado : null,
        motivoBloqueio: bloqueando ? motivoLimpo : null,
        versao: atual.versao + 1,
        atualizadoEm: new Date(),
      })
      .where(and(eq(tarefas.id, id), eq(tarefas.versao, versaoVista)))
      .returning({ versao: tarefas.versao });
    if (!salva) return { ok: false, motivo: CONFLITO };

    await tx.insert(eventosTarefa).values({
      tarefaId: id,
      tipo: "estado",
      atorId: ator.id,
      antes: atual.estado,
      depois: bloqueando ? `${para} — ${motivoLimpo}` : para,
    });
    if (atual.estado === "triagem") await avisarAtribuicao(tx, atual, atual.responsavelId!, ator.id);
    return { ok: true, versao: salva.versao };
  });
}

// Arquivar tira a tarefa das telas sem apagar nada; dá pra desfazer.
export async function arquivarTarefa(banco: Banco, ator: Ator, id: string, versaoVista: number): Promise<Resultado<{ versao: number }>> {
  return banco.transaction(async (tx) => {
    const atual = await travar(tx, id);
    if (!atual) return { ok: false, motivo: "Tarefa não encontrada." };
    if (atual.versao !== versaoVista) return { ok: false, motivo: CONFLITO };
    if (atual.estado === "arquivada") return { ok: false, motivo: "A tarefa já está arquivada." };
    // Bloqueada guarda o motivo; ao desarquivar ela volta bloqueada, e o
    // desbloqueio leva para "a fazer" (a etapa de antes do bloqueio se perde).
    const [salva] = await tx
      .update(tarefas)
      .set({ estado: "arquivada", estadoAnterior: atual.estado, versao: atual.versao + 1, atualizadoEm: new Date() })
      .where(and(eq(tarefas.id, id), eq(tarefas.versao, versaoVista)))
      .returning({ versao: tarefas.versao });
    if (!salva) return { ok: false, motivo: CONFLITO };
    await tx.insert(eventosTarefa).values({ tarefaId: id, tipo: "estado", atorId: ator.id, antes: atual.estado, depois: "arquivada" });
    return { ok: true, versao: salva.versao };
  });
}

export async function desarquivarTarefa(
  banco: Banco,
  ator: Ator,
  id: string,
  versaoVista: number
): Promise<Resultado<{ versao: number; estado: Estado }>> {
  return banco.transaction(async (tx) => {
    const atual = await travar(tx, id);
    if (!atual) return { ok: false, motivo: "Tarefa não encontrada." };
    if (atual.versao !== versaoVista) return { ok: false, motivo: CONFLITO };
    if (atual.estado !== "arquivada") return { ok: false, motivo: "A tarefa não está arquivada." };

    let volta: Estado = atual.estadoAnterior ?? "a_fazer";
    let responsavelId = atual.responsavelId;
    // Se o responsável perdeu o acesso enquanto ela estava arquivada, ou se
    // falta algo para estar liberada, ela volta pela triagem.
    if (responsavelId) {
      const [resp] = await tx.select({ ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, responsavelId)).limit(1);
      if (!resp?.ativo) responsavelId = null;
    }
    if (volta !== "triagem" && volta !== "concluida" && pendenciasParaLiberar({ ...atual, responsavelId }).length > 0) volta = "triagem";
    const bloqueada = volta === "bloqueada";

    const [salva] = await tx
      .update(tarefas)
      .set({
        estado: volta,
        estadoAnterior: null,
        responsavelId,
        motivoBloqueio: bloqueada ? atual.motivoBloqueio : null,
        versao: atual.versao + 1,
        atualizadoEm: new Date(),
      })
      .where(and(eq(tarefas.id, id), eq(tarefas.versao, versaoVista)))
      .returning({ versao: tarefas.versao });
    if (!salva) return { ok: false, motivo: CONFLITO };
    await tx.insert(eventosTarefa).values({ tarefaId: id, tipo: "estado", atorId: ator.id, antes: "arquivada", depois: `${volta} — desfez o arquivamento` });
    return { ok: true, versao: salva.versao, estado: volta };
  });
}

// ---- Comentários e checklist ----

async function tarefaExiste(tx: Tx | Banco, id: string): Promise<boolean> {
  if (!FORMATO_UUID.test(id)) return false;
  const [t] = await tx.select({ id: tarefas.id }).from(tarefas).where(eq(tarefas.id, id)).limit(1);
  return !!t;
}

export async function comentar(banco: Banco, ator: Ator, tarefaId: string, texto: string): Promise<Resultado> {
  const limpo = texto.trim();
  if (!limpo) return { ok: false, motivo: "Escreva o comentário." };
  if (limpo.length > LIMITES.comentario) return { ok: false, motivo: `O comentário pode ter até ${LIMITES.comentario} caracteres.` };
  return banco.transaction(async (tx) => {
    if (!(await tarefaExiste(tx, tarefaId))) return { ok: false, motivo: "Tarefa não encontrada." };
    await tx.insert(comentarios).values({ tarefaId, autorId: ator.id, texto: limpo });
    await tx.insert(eventosTarefa).values({ tarefaId, tipo: "comentario", atorId: ator.id, depois: limpo.slice(0, 200) });
    await tx.update(tarefas).set({ atualizadoEm: new Date() }).where(eq(tarefas.id, tarefaId));
    return { ok: true };
  });
}

export async function adicionarItem(banco: Banco, ator: Ator, tarefaId: string, texto: string): Promise<Resultado> {
  const limpo = texto.trim();
  if (!limpo) return { ok: false, motivo: "Escreva o item." };
  if (limpo.length > LIMITES.item) return { ok: false, motivo: `O item pode ter até ${LIMITES.item} caracteres.` };
  return banco.transaction(async (tx) => {
    if (!(await tarefaExiste(tx, tarefaId))) return { ok: false, motivo: "Tarefa não encontrada." };
    const [{ ultima }] = await tx.select({ ultima: max(checklistItens.ordem) }).from(checklistItens).where(eq(checklistItens.tarefaId, tarefaId));
    await tx.insert(checklistItens).values({ tarefaId, texto: limpo, ordem: (ultima ?? 0) + 1 });
    await tx.insert(eventosTarefa).values({ tarefaId, tipo: "checklist", atorId: ator.id, depois: `Adicionou: ${limpo}` });
    return { ok: true };
  });
}

export async function alternarItem(banco: Banco, ator: Ator, itemId: string): Promise<Resultado<{ concluido: boolean }>> {
  if (!FORMATO_UUID.test(itemId)) return { ok: false, motivo: "Item não encontrado." };
  return banco.transaction(async (tx) => {
    const [item] = await tx.select().from(checklistItens).where(eq(checklistItens.id, itemId)).for("update").limit(1);
    if (!item) return { ok: false, motivo: "Item não encontrado." };
    const concluido = !item.concluidoEm;
    await tx
      .update(checklistItens)
      .set({ concluidoEm: concluido ? new Date() : null, concluidoPorId: concluido ? ator.id : null })
      .where(eq(checklistItens.id, itemId));
    await tx.insert(eventosTarefa).values({
      tarefaId: item.tarefaId,
      tipo: "checklist",
      atorId: ator.id,
      depois: `${concluido ? "Marcou" : "Desmarcou"}: ${item.texto}`,
    });
    return { ok: true, concluido };
  });
}

export async function removerItem(banco: Banco, ator: Ator, itemId: string): Promise<Resultado> {
  if (!FORMATO_UUID.test(itemId)) return { ok: false, motivo: "Item não encontrado." };
  return banco.transaction(async (tx) => {
    const [item] = await tx.delete(checklistItens).where(eq(checklistItens.id, itemId)).returning();
    if (!item) return { ok: false, motivo: "Item não encontrado." };
    await tx.insert(eventosTarefa).values({ tarefaId: item.tarefaId, tipo: "checklist", atorId: ator.id, depois: `Removeu: ${item.texto}` });
    return { ok: true };
  });
}
