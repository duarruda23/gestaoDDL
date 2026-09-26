import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import type { Banco } from "@/db";
import { frentes, pedidosEntrada, propostasIa, usuarioFrentes, usuarios } from "@/db/schema";
import { VERSAO_PROMPT, montarSystemPrompt, validarPropostas, type FrenteIA, type PessoaIA } from "@/lib/interpretacao";
import { interpretarSimulado } from "@/lib/interpretar-simulado";
import type { ProvedorIA } from "@/lib/provedor-ia";
import type { Proposta } from "@/lib/types";
import { hojeISO } from "@/lib/datas";
import { criarTarefaTx, type DadosTarefa, type Resultado, type Tx } from "./tarefas-nucleo";

// Bloco B — pedido em texto livre. O texto vai para a IA (ou para as regras
// simples, se não houver IA), cada proposta é validada no servidor e fica
// guardada (auditoria, B3) até a pessoa confirmar ou descartar (B2). Nada
// vira tarefa sem revisão humana (spec, seção 6).

export const LIMITE_CARACTERES = 4000;
export const LIMITE_POR_HORA = 30; // custo de IA por pessoa
export const DIAS_RETER_TEXTO = 90; // retenção do texto livre: padrão até a decisão final (spec, seção 6)

type Conta = { id: string; nome: string };

export interface PropostaSalva extends Proposta {
  pedidoId: string;
  textoPedido: string;
}

export async function carregarEquipe(banco: Banco): Promise<{ pessoas: PessoaIA[]; frentes: FrenteIA[] }> {
  const [lista, vinculos, listaFrentes] = await Promise.all([
    banco
      .select({ id: usuarios.id, nome: usuarios.nome, funcao: usuarios.funcao })
      .from(usuarios)
      .where(eq(usuarios.ativo, true))
      .orderBy(asc(usuarios.nome)),
    banco.select().from(usuarioFrentes),
    banco
      .select({ id: frentes.id, nome: frentes.nome, liderId: frentes.referenciaId })
      .from(frentes)
      .where(eq(frentes.ativa, true))
      .orderBy(asc(frentes.nome)),
  ]);
  return {
    pessoas: lista.map((p) => ({ ...p, frenteIds: vinculos.filter((v) => v.usuarioId === p.id).map((v) => v.frenteId) })),
    frentes: listaFrentes,
  };
}

export interface ResultadoPedido {
  pedidoId: string;
  modo: "ia" | "regras";
  modelo: string | null;
  aviso?: string;
  propostas: PropostaSalva[];
}

export async function interpretarPedido(
  banco: Banco,
  conta: Conta,
  texto: string,
  ia: ProvedorIA | null,
  hoje = hojeISO()
): Promise<Resultado<ResultadoPedido>> {
  const limpo = texto.trim();
  if (!limpo) return { ok: false, motivo: "Escreva o pedido antes de enviar." };
  if (limpo.length > LIMITE_CARACTERES)
    return { ok: false, motivo: `Pedido muito longo (máximo ${LIMITE_CARACTERES} caracteres). Divida em partes.` };

  const [{ n }] = await banco
    .select({ n: sql<number>`count(*)::int` })
    .from(pedidosEntrada)
    .where(and(eq(pedidosEntrada.autorId, conta.id), gte(pedidosEntrada.criadoEm, new Date(Date.now() - 3_600_000))));
  if (n >= LIMITE_POR_HORA) return { ok: false, motivo: "Muitos pedidos na última hora. Espere um pouco ou use o formulário." };

  const { pessoas, frentes: listaFrentes } = await carregarEquipe(banco);
  const autor = pessoas.find((p) => p.id === conta.id) ?? null;

  let modo: "ia" | "regras" = "regras";
  let aviso: string | undefined;
  let propostas: Proposta[];
  const porRegras = () => validarPropostas(interpretarSimulado(limpo, hoje, pessoas, listaFrentes), hoje, pessoas, listaFrentes);
  if (!ia) {
    propostas = porRegras();
    aviso = "Nenhuma IA configurada neste ambiente. Interpretação feita por regras simples; revise com atenção.";
  } else {
    try {
      const bruto = await ia.interpretar(montarSystemPrompt(hoje, pessoas, listaFrentes, autor), limpo);
      propostas = validarPropostas(bruto, hoje, pessoas, listaFrentes);
      modo = "ia";
    } catch (erro) {
      console.error("[interpretar] falha na IA:", erro);
      propostas = porRegras();
      aviso = `${ia.descreverErro(erro)} Usei a interpretação por regras; revise com atenção.`;
    }
  }
  if (!propostas.length) return { ok: false, motivo: "Não encontrei nenhuma entrega nesse texto. Tente descrever o que precisa ser feito." };
  propostas = propostas.slice(0, 20);

  const salvas = await banco.transaction(async (tx) => {
    const [pedido] = await tx
      .insert(pedidosEntrada)
      .values({
        autorId: conta.id,
        texto: limpo,
        modo,
        provedor: modo === "ia" ? ia!.provedor : null,
        modelo: modo === "ia" ? ia!.modelo : null,
        versaoPrompt: VERSAO_PROMPT,
        apagarTextoEm: new Date(Date.now() + DIAS_RETER_TEXTO * 86_400_000),
      })
      .returning({ id: pedidosEntrada.id });
    const linhas = await tx
      .insert(propostasIa)
      .values(propostas.map((p, i) => ({ pedidoId: pedido.id, ordem: i + 1, original: p })))
      .returning({ id: propostasIa.id, ordem: propostasIa.ordem });
    return { pedidoId: pedido.id, ids: linhas.sort((a, b) => a.ordem - b.ordem).map((l) => l.id) };
  });

  return {
    ok: true,
    pedidoId: salvas.pedidoId,
    modo,
    modelo: modo === "ia" ? ia!.modelo : null,
    aviso,
    propostas: propostas.map((p, i) => ({ ...p, id: salvas.ids[i], pedidoId: salvas.pedidoId, textoPedido: limpo })),
  };
}

// Propostas que a pessoa ainda não revisou: voltam na tela Pedir, para
// ninguém perder um pedido por fechar a aba.
export async function propostasAbertas(banco: Banco, contaId: string): Promise<PropostaSalva[]> {
  const linhas = await banco
    .select({ id: propostasIa.id, original: propostasIa.original, pedidoId: pedidosEntrada.id, texto: pedidosEntrada.texto })
    .from(propostasIa)
    .innerJoin(pedidosEntrada, eq(pedidosEntrada.id, propostasIa.pedidoId))
    .where(and(eq(pedidosEntrada.autorId, contaId), eq(propostasIa.situacao, "aberta")))
    .orderBy(desc(pedidosEntrada.criadoEm), asc(propostasIa.ordem))
    .limit(50);
  return linhas.map((l) => ({ ...(l.original as Proposta), id: l.id, pedidoId: l.pedidoId, textoPedido: l.texto }));
}

async function propostaDoAutor(tx: Tx, contaId: string, propostaId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(propostaId)) return null;
  const [p] = await tx
    .select({ id: propostasIa.id, situacao: propostasIa.situacao, pedidoId: propostasIa.pedidoId, autorId: pedidosEntrada.autorId })
    .from(propostasIa)
    .innerJoin(pedidosEntrada, eq(pedidosEntrada.id, propostasIa.pedidoId))
    .where(eq(propostasIa.id, propostaId))
    .for("update", { of: propostasIa })
    .limit(1);
  // A revisão é de quem escreveu o pedido: a proposta ainda não é tarefa de ninguém.
  if (!p || p.autorId !== contaId) return null;
  return p;
}

export async function confirmarProposta(
  banco: Banco,
  conta: Conta,
  propostaId: string,
  dados: DadosTarefa & { itens?: string[]; envolvidosIds?: string[] }
): Promise<Resultado<{ tarefaId: string; estado: string }>> {
  return banco.transaction(async (tx) => {
    const p = await propostaDoAutor(tx, conta.id, propostaId);
    if (!p) return { ok: false, motivo: "Proposta não encontrada." };
    if (p.situacao !== "aberta") return { ok: false, motivo: "Essa proposta já foi revisada." };
    const r = await criarTarefaTx(tx, conta, dados, { origem: "ia", pedidoId: p.pedidoId, envolvidosIds: dados.envolvidosIds });
    if (!r.ok) return r;
    await tx
      .update(propostasIa)
      .set({ situacao: "confirmada", confirmada: dados, tarefaId: r.id, revisadaPorId: conta.id, revisadaEm: new Date() })
      .where(eq(propostasIa.id, p.id));
    return { ok: true, tarefaId: r.id, estado: r.estado };
  });
}

export async function descartarProposta(banco: Banco, conta: Conta, propostaId: string): Promise<Resultado> {
  return banco.transaction(async (tx) => {
    const p = await propostaDoAutor(tx, conta.id, propostaId);
    if (!p) return { ok: false, motivo: "Proposta não encontrada." };
    if (p.situacao !== "aberta") return { ok: false, motivo: "Essa proposta já foi revisada." };
    await tx
      .update(propostasIa)
      .set({ situacao: "descartada", revisadaPorId: conta.id, revisadaEm: new Date() })
      .where(eq(propostasIa.id, p.id));
    return { ok: true };
  });
}

// B3 — auditoria: quanto a IA acerta. Uma proposta confirmada sem mudar
// responsável, prazo e frente conta como "aceita como veio".
export async function resumoAuditoria(banco: Banco, dias = 30) {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const linhas = await banco
    .select({ situacao: propostasIa.situacao, original: propostasIa.original, confirmada: propostasIa.confirmada, modo: pedidosEntrada.modo })
    .from(propostasIa)
    .innerJoin(pedidosEntrada, eq(pedidosEntrada.id, propostasIa.pedidoId))
    .where(gte(pedidosEntrada.criadoEm, desde));
  const campos = ["responsavelId", "prazo", "frenteId"] as const;
  const confirmadas = linhas.filter((l) => l.situacao === "confirmada");
  const semMudanca = confirmadas.filter((l) => {
    const o = l.original as Record<string, unknown>;
    const c = (l.confirmada ?? {}) as Record<string, unknown>;
    return campos.every((k) => (o[k] ?? null) === (c[k] ?? null));
  });
  return {
    propostas: linhas.length,
    confirmadas: confirmadas.length,
    descartadas: linhas.filter((l) => l.situacao === "descartada").length,
    abertas: linhas.filter((l) => l.situacao === "aberta").length,
    aceitasComoVieram: semMudanca.length,
    porRegras: linhas.filter((l) => l.modo === "regras").length,
  };
}

// Retenção (spec, seção 6): apaga o texto livre vencido, mantendo o resto da
// auditoria. Chamado junto com as cobranças automáticas.
export async function apagarTextosVencidos(banco: Banco, agora = new Date()): Promise<number> {
  const r = await banco
    .update(pedidosEntrada)
    .set({ texto: "", apagarTextoEm: null })
    .where(and(sql`${pedidosEntrada.apagarTextoEm} IS NOT NULL`, sql`${pedidosEntrada.apagarTextoEm} <= ${agora}`))
    .returning({ id: pedidosEntrada.id });
  return r.length;
}
