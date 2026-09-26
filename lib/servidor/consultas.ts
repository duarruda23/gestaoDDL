import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Banco } from "@/db";
import {
  checklistItens,
  comentarios,
  eventosTarefa,
  frentes,
  mensagens,
  tarefaEnvolvidos,
  tarefas,
  usuarios,
} from "@/db/schema";
import { estaAtiva, estaVencida, ordenarPorUrgencia, venceEmBreve } from "@/lib/regras";
import type { Estado } from "@/lib/types";
import type { Pessoa, TarefaDetalhe, TarefaVisao } from "@/lib/visao";

// A6 — leituras do banco para as telas. Modelo horizontal: toda conta ativa
// vê todas as tarefas; por isso as consultas não filtram por pessoa (as
// telas filtram "com você", "você pediu" etc. sobre o mesmo conjunto).

const responsavel = alias(usuarios, "responsavel");
const criador = alias(usuarios, "criador");

const colunasVisao = {
  id: tarefas.id,
  titulo: tarefas.titulo,
  estado: tarefas.estado,
  estadoAnterior: tarefas.estadoAnterior,
  prioridade: tarefas.prioridade,
  prazo: tarefas.prazo,
  origem: tarefas.origem,
  motivoBloqueio: tarefas.motivoBloqueio,
  versao: tarefas.versao,
  responsavelId: responsavel.id,
  responsavelNome: responsavel.nome,
  criadorId: criador.id,
  criadorNome: criador.nome,
  frenteId: frentes.id,
  frenteNome: frentes.nome,
  checklistTotal: sql<number>`(select count(*)::int from ${checklistItens} c where c.tarefa_id = ${tarefas.id})`,
  checklistFeitos: sql<number>`(select count(*)::int from ${checklistItens} c where c.tarefa_id = ${tarefas.id} and c.concluido_em is not null)`,
};

type LinhaVisao = {
  [K in keyof typeof colunasVisao]: unknown;
};

function paraVisao(l: LinhaVisao): TarefaVisao {
  return {
    id: l.id as string,
    titulo: l.titulo as string,
    estado: l.estado as Estado,
    estadoAnterior: (l.estadoAnterior as Estado | null) ?? null,
    prioridade: l.prioridade as TarefaVisao["prioridade"],
    prazo: (l.prazo as string | null) ?? null,
    origem: l.origem as TarefaVisao["origem"],
    motivoBloqueio: (l.motivoBloqueio as string | null) ?? null,
    versao: l.versao as number,
    responsavel: l.responsavelId ? { id: l.responsavelId as string, nome: l.responsavelNome as string } : null,
    criador: { id: l.criadorId as string, nome: l.criadorNome as string },
    frente: l.frenteId ? { id: l.frenteId as string, nome: l.frenteNome as string } : null,
    checklistTotal: Number(l.checklistTotal ?? 0),
    checklistFeitos: Number(l.checklistFeitos ?? 0),
  };
}

function baseDaVisao(banco: Banco) {
  return banco
    .select(colunasVisao)
    .from(tarefas)
    .innerJoin(criador, eq(criador.id, tarefas.criadorId))
    .leftJoin(responsavel, eq(responsavel.id, tarefas.responsavelId))
    .leftJoin(frentes, eq(frentes.id, tarefas.frenteId));
}

// Todas as tarefas não arquivadas, da mais urgente para a menos.
export async function listarTarefas(banco: Banco): Promise<TarefaVisao[]> {
  const linhas = await baseDaVisao(banco).where(ne(tarefas.estado, "arquivada"));
  return linhas.map(paraVisao).sort(ordenarPorUrgencia);
}

export async function listarTriagem(banco: Banco): Promise<TarefaVisao[]> {
  const linhas = await baseDaVisao(banco).where(eq(tarefas.estado, "triagem"));
  return linhas.map(paraVisao).sort(ordenarPorUrgencia);
}

export interface Inicio {
  comVoce: TarefaVisao[];
  vencidasComVoce: TarefaVisao[];
  proximasComVoce: TarefaVisao[];
  bloqueadasComVoce: TarefaVisao[];
  vocePediu: TarefaVisao[]; // você pediu, em aberto, com outra pessoa
  vocePediuVencidas: number;
}

export async function montarInicio(banco: Banco, contaId: string, hoje?: string): Promise<Inicio> {
  const todas = (await listarTarefas(banco)).filter((t) => estaAtiva(t));
  const comVoce = todas.filter((t) => t.responsavel?.id === contaId);
  const vencidasComVoce = comVoce.filter((t) => estaVencida(t, hoje));
  const vocePediu = todas.filter((t) => t.criador.id === contaId && t.responsavel?.id !== contaId);
  return {
    comVoce,
    vencidasComVoce,
    proximasComVoce: comVoce.filter((t) => !estaVencida(t, hoje) && t.estado !== "bloqueada"),
    bloqueadasComVoce: comVoce.filter((t) => t.estado === "bloqueada"),
    vocePediu,
    vocePediuVencidas: vocePediu.filter((t) => estaVencida(t, hoje)).length,
  };
}

export interface Painel {
  vencidas: TarefaVisao[];
  semDono: TarefaVisao[];
  bloqueadas: TarefaVisao[];
  vencendo: TarefaVisao[];
  falhasWhatsapp: number;
  porPessoa: {
    pessoa: Pessoa;
    comEla: number;
    vencidasComEla: number;
    pediuEmAberto: number;
    cobrou: number;
    foiCobrada: number;
  }[];
}

export async function montarPainel(banco: Banco, hoje?: string): Promise<Painel> {
  const [todas, pessoas, manuais, falhas] = await Promise.all([
    listarTarefas(banco),
    banco.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.ativo, true)).orderBy(asc(usuarios.nome)),
    banco
      .select({ autorId: mensagens.autorId, destinatarioId: mensagens.destinatarioId })
      .from(mensagens)
      .where(and(eq(mensagens.regra, "cobranca_manual"), isNotNull(mensagens.autorId))),
    banco.select({ n: sql<number>`count(*)::int` }).from(mensagens).where(eq(mensagens.status, "falhou")),
  ]);
  const ativas = todas.filter((t) => estaAtiva(t));
  const porPessoa = pessoas
    .map((p) => {
      const comEla = ativas.filter((t) => t.responsavel?.id === p.id);
      return {
        pessoa: p,
        comEla: comEla.length,
        vencidasComEla: comEla.filter((t) => estaVencida(t, hoje)).length,
        pediuEmAberto: ativas.filter((t) => t.criador.id === p.id && t.responsavel?.id !== p.id).length,
        cobrou: manuais.filter((m) => m.autorId === p.id).length,
        foiCobrada: manuais.filter((m) => m.destinatarioId === p.id).length,
      };
    })
    .sort((a, b) => b.vencidasComEla - a.vencidasComEla || b.comEla - a.comEla);

  return {
    vencidas: ativas.filter((t) => estaVencida(t, hoje)),
    semDono: ativas.filter((t) => !t.responsavel || t.estado === "triagem"),
    bloqueadas: ativas.filter((t) => t.estado === "bloqueada"),
    vencendo: ativas.filter((t) => venceEmBreve(t, hoje) && t.estado !== "bloqueada"),
    falhasWhatsapp: falhas[0]?.n ?? 0,
    porPessoa,
  };
}

export async function detalharTarefa(banco: Banco, id: string): Promise<TarefaDetalhe | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null; // id inválido nem chega ao banco
  const [linha] = await baseDaVisao(banco).where(eq(tarefas.id, id)).limit(1);
  if (!linha) return null;
  const autor = alias(usuarios, "autor");
  const destinatario = alias(usuarios, "destinatario");

  const [extra, envolvidos, checklist, coments, eventos, msgs] = await Promise.all([
    banco
      .select({ descricao: tarefas.descricao, usaRevisao: frentes.usaRevisao })
      .from(tarefas)
      .leftJoin(frentes, eq(frentes.id, tarefas.frenteId))
      .where(eq(tarefas.id, id)),
    banco
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(tarefaEnvolvidos)
      .innerJoin(usuarios, eq(usuarios.id, tarefaEnvolvidos.usuarioId))
      .where(eq(tarefaEnvolvidos.tarefaId, id)),
    banco
      .select({ id: checklistItens.id, texto: checklistItens.texto, concluidoEm: checklistItens.concluidoEm })
      .from(checklistItens)
      .where(eq(checklistItens.tarefaId, id))
      .orderBy(asc(checklistItens.ordem)),
    banco
      .select({ id: comentarios.id, texto: comentarios.texto, criadoEm: comentarios.criadoEm, autor: usuarios.nome })
      .from(comentarios)
      .innerJoin(usuarios, eq(usuarios.id, comentarios.autorId))
      .where(eq(comentarios.tarefaId, id))
      .orderBy(asc(comentarios.criadoEm)),
    banco
      .select({
        id: eventosTarefa.id,
        tipo: eventosTarefa.tipo,
        antes: eventosTarefa.antes,
        depois: eventosTarefa.depois,
        criadoEm: eventosTarefa.criadoEm,
        ator: usuarios.nome,
      })
      .from(eventosTarefa)
      .leftJoin(usuarios, eq(usuarios.id, eventosTarefa.atorId))
      .where(eq(eventosTarefa.tarefaId, id))
      .orderBy(desc(eventosTarefa.criadoEm), desc(eventosTarefa.id)),
    banco
      .select({ id: mensagens.id, regra: mensagens.regra, status: mensagens.status, autor: autor.nome, destinatario: destinatario.nome })
      .from(mensagens)
      .leftJoin(autor, eq(autor.id, mensagens.autorId))
      .innerJoin(destinatario, eq(destinatario.id, mensagens.destinatarioId))
      .where(eq(mensagens.tarefaId, id))
      .orderBy(desc(mensagens.criadoEm)),
  ]);

  return {
    ...paraVisao(linha),
    descricao: extra[0]?.descricao ?? "",
    frenteUsaRevisao: Boolean(extra[0]?.usaRevisao),
    envolvidos,
    checklist: checklist.map((c) => ({ id: c.id, texto: c.texto, concluido: c.concluidoEm !== null })),
    comentarios: coments.map((c) => ({ id: c.id, autor: c.autor, texto: c.texto, criadoEm: c.criadoEm.toISOString() })),
    eventos: eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      ator: e.ator ?? "Sistema",
      antes: e.antes,
      depois: e.depois,
      criadoEm: e.criadoEm.toISOString(),
    })),
    mensagens: msgs.map((m) => ({ id: m.id, regra: m.regra, status: m.status, autor: m.autor, destinatario: m.destinatario })),
  };
}

export async function listarPessoasEFrentes(banco: Banco) {
  const [pessoas, listaFrentes] = await Promise.all([
    banco.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.ativo, true)).orderBy(asc(usuarios.nome)),
    banco
      .select({ id: frentes.id, nome: frentes.nome, usaRevisao: frentes.usaRevisao })
      .from(frentes)
      .where(eq(frentes.ativa, true))
      .orderBy(asc(frentes.nome)),
  ]);
  return { pessoas, frentes: listaFrentes };
}

