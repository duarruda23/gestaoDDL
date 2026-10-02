import { and, eq, inArray } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosTarefa, frentes, seriesRecorrentes, tarefas, usuarios } from "@/db/schema";
import { chaveOcorrencia, dataHoraRecife, datasProgramadas, type RegraRecorrencia } from "@/lib/recorrencia/calendario";

const ABERTAS = ["triagem", "a_fazer", "em_andamento", "em_revisao", "bloqueada"] as const;

export type ResultadoSerie = {
  serieId: string;
  criadas: number;
  jaExistiam: number;
  requerAtencao: boolean;
  motivo?: "limite" | "responsavel_inativo" | "frente_inativa";
};

function regraDaSerie(s: typeof seriesRecorrentes.$inferSelect): RegraRecorrencia {
  const base = { inicioEm: s.inicioEm, fimEm: s.fimEm, intervalo: s.intervalo };
  if (s.frequencia === "diaria") return { ...base, frequencia: "diaria" };
  if (s.frequencia === "semanal" || s.frequencia === "personalizada")
    return { ...base, frequencia: s.frequencia, diasSemana: s.diasSemana ?? [] };
  if (s.frequencia === "mensal")
    return { ...base, frequencia: "mensal", ...(s.ultimoDiaMes ? { ultimoDiaMes: true } : { diaMes: s.diaMes ?? undefined }) };
  return { ...base, frequencia: "anual", mesAno: s.mesAno!, diaAno: s.diaAno! };
}

// A transação trava a série. Dois workers aguardam a mesma linha; o índice
// único (série, data) protege também contra retentativas fora da transação.
export async function materializarSerie(banco: Banco, serieId: string, agora = new Date()): Promise<ResultadoSerie> {
  const hoje = dataHoraRecife(agora).data;
  return banco.transaction(async (tx) => {
    const [serie] = await tx.select().from(seriesRecorrentes)
      .where(eq(seriesRecorrentes.id, serieId)).for("update").limit(1);
    const resultado: ResultadoSerie = { serieId, criadas: 0, jaExistiam: 0, requerAtencao: false };
    if (!serie || serie.estado !== "ativa") return resultado;

    const abertas = await tx.select({ id: tarefas.id }).from(tarefas)
      .where(and(eq(tarefas.serieRecorrenteId, serieId), inArray(tarefas.estado, [...ABERTAS])));
    let totalAbertas = abertas.length;
    if (totalAbertas >= 3) {
      await tx.update(seriesRecorrentes).set({ requerAtencao: true, atualizadaEm: agora })
        .where(eq(seriesRecorrentes.id, serieId));
      return { ...resultado, requerAtencao: true, motivo: "limite" };
    }

    const [[responsavel], [frente]] = await Promise.all([
      tx.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, serie.responsavelId), eq(usuarios.ativo, true))).limit(1),
      tx.select({ id: frentes.id }).from(frentes).where(and(eq(frentes.id, serie.frenteId), eq(frentes.ativa, true))).limit(1),
    ]);
    if (!responsavel || !frente) {
      await tx.update(seriesRecorrentes).set({ requerAtencao: true, atualizadaEm: agora })
        .where(eq(seriesRecorrentes.id, serieId));
      return { ...resultado, requerAtencao: true, motivo: !responsavel ? "responsavel_inativo" : "frente_inativa" };
    }

    // Depois de intervenção humana, não recuperar as datas que ficaram
    // bloqueadas pelo teto ou por um responsável inativo.
    const gerarDesde = serie.requerAtencao && serie.gerarDesde < hoje ? hoje : serie.gerarDesde;
    if (serie.requerAtencao) {
      await tx.update(seriesRecorrentes).set({ requerAtencao: false, gerarDesde, atualizadaEm: agora })
        .where(eq(seriesRecorrentes.id, serieId));
    }
    const datas = datasProgramadas(regraDaSerie(serie), gerarDesde, hoje);
    const existentes = await tx.select({ chave: tarefas.chaveOcorrencia }).from(tarefas)
      .where(eq(tarefas.serieRecorrenteId, serieId));
    const chaves = new Set(existentes.map((t) => t.chave));
    for (const data of datas) {
      const chave = chaveOcorrencia(data);
      if (chaves.has(chave)) { resultado.jaExistiam++; continue; }
      if (totalAbertas >= 3) {
        resultado.requerAtencao = true;
        resultado.motivo = "limite";
        break;
      }
      const [tarefa] = await tx.insert(tarefas).values({
        titulo: serie.titulo, descricao: serie.descricao, frenteId: serie.frenteId,
        responsavelId: serie.responsavelId, criadorId: serie.criadoPorId,
        estado: "a_fazer", prioridade: serie.prioridade, prazo: data,
        prazoHora: serie.horaVencimento, origem: "manual",
        serieRecorrenteId: serie.id, chaveOcorrencia: chave,
        dataProgramadaLocal: data, geradaEm: agora, origemOcorrencia: "automatica",
      }).onConflictDoNothing().returning({ id: tarefas.id });
      if (!tarefa) { resultado.jaExistiam++; continue; }
      await tx.insert(eventosTarefa).values({
        tarefaId: tarefa.id, tipo: "criada", atorId: null, depois: `Ocorrência de ${data} da série ${serie.id}`,
      });
      chaves.add(chave);
      resultado.criadas++;
      totalAbertas++;
    }
    if (totalAbertas >= 3) {
      resultado.requerAtencao = true;
      resultado.motivo = "limite";
    }
    await tx.update(seriesRecorrentes).set({ requerAtencao: resultado.requerAtencao, atualizadaEm: agora })
      .where(eq(seriesRecorrentes.id, serieId));
    return resultado;
  });
}

export async function materializarRecorrencias(banco: Banco, agora = new Date()) {
  const series = await banco.select({ id: seriesRecorrentes.id }).from(seriesRecorrentes)
    .where(eq(seriesRecorrentes.estado, "ativa"));
  const resultados: ResultadoSerie[] = [];
  const falhas: { serieId: string; erro: string }[] = [];
  for (const serie of series) {
    try {
      resultados.push(await materializarSerie(banco, serie.id, agora));
    } catch (e) {
      falhas.push({ serieId: serie.id, erro: e instanceof Error ? e.message : "Falha desconhecida" });
    }
  }
  return { resultados, falhas };
}
