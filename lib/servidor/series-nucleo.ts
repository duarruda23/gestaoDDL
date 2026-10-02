import { and, eq, inArray, sql } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosSerie, eventosTarefa, frentes, seriesRecorrentes, tarefas, usuarios } from "@/db/schema";
import { dataHoraRecife, datasProgramadas, validarRegra, type RegraRecorrencia } from "@/lib/recorrencia/calendario";
import { FORMATO_HORA } from "@/lib/datas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIORIDADES = ["baixa", "media", "alta", "urgente"] as const;
const ABERTAS = ["triagem", "a_fazer", "em_andamento", "em_revisao", "bloqueada"] as const;
type Prioridade = (typeof PRIORIDADES)[number];
type Ator = { id: string };
type Resultado<T = object> = ({ ok: true } & T) | { ok: false; motivo: string };

export type DadosSerie = {
  titulo: string;
  descricao: string;
  frenteId: string;
  prioridade: Prioridade;
  responsavelId: string;
  horaVencimento: string | null;
  regra: RegraRecorrencia;
};

function erro(motivo: string): { ok: false; motivo: string } { return { ok: false, motivo }; }

function validarDados(d: DadosSerie): string | null {
  if (!d.titulo.trim() || d.titulo.trim().length > 200) return "O título deve ter até 200 caracteres.";
  if (d.descricao.length > 5000) return "A descrição deve ter até 5.000 caracteres.";
  if (!UUID.test(d.frenteId) || !UUID.test(d.responsavelId)) return "Escolha frente e responsável.";
  if (!PRIORIDADES.includes(d.prioridade)) return "Prioridade inválida.";
  if (d.horaVencimento && !FORMATO_HORA.test(d.horaVencimento)) return "Hora de vencimento inválida.";
  try { validarRegra(d.regra); } catch (e) { return e instanceof Error ? e.message : "Regra inválida."; }
  return null;
}

function camposRegra(r: RegraRecorrencia) {
  return {
    frequencia: r.frequencia,
    intervalo: r.intervalo,
    inicioEm: r.inicioEm,
    fimEm: r.fimEm || null,
    diasSemana: r.frequencia === "semanal" || r.frequencia === "personalizada" ? [...r.diasSemana].sort((a, b) => a - b) : null,
    diaMes: r.frequencia === "mensal" && !r.ultimoDiaMes ? r.diaMes! : null,
    ultimoDiaMes: r.frequencia === "mensal" && Boolean(r.ultimoDiaMes),
    mesAno: r.frequencia === "anual" ? r.mesAno : null,
    diaAno: r.frequencia === "anual" ? r.diaAno : null,
  };
}

async function validarReferencias(banco: Banco, dados: DadosSerie): Promise<string | null> {
  const [[frente], [responsavel]] = await Promise.all([
    banco.select({ id: frentes.id }).from(frentes).where(and(eq(frentes.id, dados.frenteId), eq(frentes.ativa, true))).limit(1),
    banco.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, dados.responsavelId), eq(usuarios.ativo, true))).limit(1),
  ]);
  if (!frente) return "Frente não encontrada ou inativa.";
  if (!responsavel) return "Responsável sem acesso ativo.";
  return null;
}

export async function criarSerie(banco: Banco, ator: Ator, dados: DadosSerie, agora = new Date()): Promise<Resultado<{ id: string }>> {
  const problema = validarDados(dados) ?? await validarReferencias(banco, dados);
  if (problema) return erro(problema);
  const hoje = dataHoraRecife(agora).data;
  const gerarDesde = dados.regra.inicioEm > hoje ? dados.regra.inicioEm : hoje;
  if (dados.regra.fimEm && dados.regra.fimEm < gerarDesde) return erro("O fim da série já passou.");
  return banco.transaction(async (tx) => {
    const [serie] = await tx.insert(seriesRecorrentes).values({
      titulo: dados.titulo.trim(), descricao: dados.descricao.trim(), frenteId: dados.frenteId,
      prioridade: dados.prioridade, responsavelId: dados.responsavelId, criadoPorId: ator.id,
      horaVencimento: dados.horaVencimento || null, gerarDesde, ...camposRegra(dados.regra),
    }).returning();
    await tx.insert(eventosSerie).values({ serieId: serie.id, tipo: "criada", atorId: ator.id, depois: serie });
    return { ok: true, id: serie.id };
  });
}

export async function editarSerie(
  banco: Banco, ator: Ator, id: string, versao: number, dados: DadosSerie,
  aplicarResponsavelAbertas = false, agora = new Date()
): Promise<Resultado<{ versao: number }>> {
  if (!UUID.test(id) || !Number.isSafeInteger(versao) || versao < 1) return erro("Série inválida.");
  const problema = validarDados(dados) ?? await validarReferencias(banco, dados);
  if (problema) return erro(problema);
  return banco.transaction(async (tx) => {
    const [anterior] = await tx.select().from(seriesRecorrentes).where(eq(seriesRecorrentes.id, id)).limit(1);
    if (!anterior) return erro("Série não encontrada.");
    if (anterior.estado === "encerrada") return erro("Série encerrada não pode ser editada.");
    if (anterior.versao !== versao) return erro("A série mudou em outra sessão. Recarregue a página.");
    const hoje = dataHoraRecife(agora).data;
    const gerarDesde = [anterior.gerarDesde, dados.regra.inicioEm, hoje].sort().at(-1)!;
    if (dados.regra.fimEm && dados.regra.fimEm < gerarDesde) return erro("O fim da série já passou.");
    const [atual] = await tx.update(seriesRecorrentes).set({
      titulo: dados.titulo.trim(), descricao: dados.descricao.trim(), frenteId: dados.frenteId,
      prioridade: dados.prioridade, responsavelId: dados.responsavelId, horaVencimento: dados.horaVencimento || null,
      gerarDesde, ...camposRegra(dados.regra), versao: versao + 1, atualizadaEm: agora,
    }).where(and(eq(seriesRecorrentes.id, id), eq(seriesRecorrentes.versao, versao))).returning();
    if (!atual) return erro("A série mudou em outra sessão. Recarregue a página.");
    await tx.insert(eventosSerie).values({
      serieId: id, tipo: "editada", atorId: ator.id, antes: anterior, depois: {
        serie: atual, aplicarResponsavelAbertas,
      },
    });
    if (aplicarResponsavelAbertas && anterior.responsavelId !== dados.responsavelId) {
      const abertas = await tx.select({ id: tarefas.id, responsavelId: tarefas.responsavelId })
        .from(tarefas).where(and(eq(tarefas.serieRecorrenteId, id), inArray(tarefas.estado, [...ABERTAS])));
      for (const t of abertas) {
        await tx.update(tarefas).set({
          responsavelId: dados.responsavelId, versao: sql`${tarefas.versao} + 1`, atualizadoEm: agora,
        }).where(eq(tarefas.id, t.id));
        await tx.insert(eventosTarefa).values({
          tarefaId: t.id, tipo: "responsavel", atorId: ator.id,
          antes: t.responsavelId, depois: dados.responsavelId,
        });
      }
    }
    return { ok: true, versao: atual.versao };
  });
}

export async function mudarEstadoSerie(
  banco: Banco, ator: Ator, id: string, versao: number,
  acao: "pausar" | "retomar" | "encerrar", motivo: string, agora = new Date()
): Promise<Resultado> {
  if (!UUID.test(id) || !Number.isSafeInteger(versao) || versao < 1) return erro("Série inválida.");
  if (acao !== "retomar" && (!motivo.trim() || motivo.trim().length > 500)) return erro("Informe um motivo de até 500 caracteres.");
  return banco.transaction(async (tx) => {
    const [anterior] = await tx.select().from(seriesRecorrentes).where(eq(seriesRecorrentes.id, id)).limit(1);
    if (!anterior) return erro("Série não encontrada.");
    if (anterior.versao !== versao) return erro("A série mudou em outra sessão. Recarregue a página.");
    if (acao === "pausar" && anterior.estado !== "ativa") return erro("Só uma série ativa pode ser pausada.");
    if (acao === "retomar" && anterior.estado !== "pausada") return erro("Só uma série pausada pode ser retomada.");
    if (acao === "encerrar" && anterior.estado === "encerrada") return erro("Série já encerrada.");
    if (acao === "retomar") {
      const [responsavel] = await tx.select({ id: usuarios.id }).from(usuarios)
        .where(and(eq(usuarios.id, anterior.responsavelId), eq(usuarios.ativo, true))).limit(1);
      if (!responsavel) return erro("Escolha um responsável ativo antes de retomar.");
    }
    const hoje = dataHoraRecife(agora).data;
    const [atual] = await tx.update(seriesRecorrentes).set({
      estado: acao === "pausar" ? "pausada" : acao === "retomar" ? "ativa" : "encerrada",
      ...(acao === "pausar" ? { pausadaEm: agora, pausadaPorId: ator.id, motivoPausa: motivo.trim() } : {}),
      ...(acao === "retomar" ? { gerarDesde: hoje > anterior.inicioEm ? hoje : anterior.inicioEm, pausadaEm: null, pausadaPorId: null, motivoPausa: null } : {}),
      ...(acao === "encerrar" ? { encerradaEm: agora, encerradaPorId: ator.id, motivoEncerramento: motivo.trim() } : {}),
      versao: versao + 1, atualizadaEm: agora,
    }).where(and(eq(seriesRecorrentes.id, id), eq(seriesRecorrentes.versao, versao))).returning();
    if (!atual) return erro("A série mudou em outra sessão. Recarregue a página.");
    await tx.insert(eventosSerie).values({ serieId: id, tipo: acao, atorId: ator.id, antes: anterior, depois: atual });
    return { ok: true };
  });
}

export function proximasDatasSerie(regra: RegraRecorrencia, gerarDesde: string, agora = new Date()): string[] {
  const hoje = dataHoraRecife(agora).data;
  const ate = new Date(`${hoje}T00:00:00Z`);
  ate.setUTCFullYear(ate.getUTCFullYear() + 6);
  return datasProgramadas(regra, gerarDesde > hoje ? gerarDesde : hoje, ate.toISOString().slice(0, 10)).slice(0, 5);
}
