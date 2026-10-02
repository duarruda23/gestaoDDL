import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { eventosSerie, eventosTarefa, frentes, seriesRecorrentes, tarefas } from "@/db/schema";
import { criarSerie, editarSerie, mudarEstadoSerie, type DadosSerie } from "@/lib/servidor/series-nucleo";
import { criarBancoDeTeste, criarConta } from "./banco";

describe("ciclo de vida da série recorrente", () => {
  let ctx: Awaited<ReturnType<typeof criarBancoDeTeste>>;
  beforeAll(async () => { ctx = await criarBancoDeTeste(); });
  afterAll(async () => { await ctx.pg.close(); });

  it("cria, edita com versão, pausa, retoma sem retroação e encerra", async () => {
    const { banco } = ctx;
    const ator = await criarConta(banco);
    const ana = await criarConta(banco);
    const bia = await criarConta(banco);
    const [frente] = await banco.insert(frentes).values({ nome: "Conteúdo" }).returning();
    const dados: DadosSerie = {
      titulo: "Publicar agenda", descricao: "Texto", frenteId: frente.id,
      responsavelId: ana.id, prioridade: "media", horaVencimento: "09:00",
      regra: { frequencia: "semanal", intervalo: 1, inicioEm: "2026-10-01", diasSemana: [2] },
    };
    const inicio = new Date("2026-10-01T12:00:00Z");
    const criada = await criarSerie(banco, ator, dados, inicio);
    expect(criada.ok).toBe(true);
    if (!criada.ok) return;
    const [serie] = await banco.select().from(seriesRecorrentes).where(eq(seriesRecorrentes.id, criada.id));
    expect(serie.gerarDesde).toBe("2026-10-01");
    const [aberta] = await banco.insert(tarefas).values({
      titulo: "Publicar agenda", frenteId: frente.id, responsavelId: ana.id, criadorId: ator.id,
      estado: "a_fazer", prazo: "2026-10-06", serieRecorrenteId: serie.id,
      chaveOcorrencia: "2026-10-06", dataProgramadaLocal: "2026-10-06",
      geradaEm: new Date("2026-10-06T03:00:00Z"), origemOcorrencia: "automatica",
    }).returning();
    const [concluida] = await banco.insert(tarefas).values({
      titulo: "Agenda antiga", frenteId: frente.id, responsavelId: ana.id, criadorId: ator.id,
      estado: "concluida", prazo: "2026-09-29", serieRecorrenteId: serie.id,
      chaveOcorrencia: "2026-09-29", dataProgramadaLocal: "2026-09-29",
      geradaEm: new Date("2026-09-29T03:00:00Z"), origemOcorrencia: "automatica",
    }).returning();
    const editada = await editarSerie(banco, ator, serie.id, 1, { ...dados, responsavelId: bia.id }, true, new Date("2026-10-07T12:00:00Z"));
    expect(editada).toEqual({ ok: true, versao: 2 });
    expect(await editarSerie(banco, ator, serie.id, 1, dados)).toMatchObject({ ok: false });
    const [atualAberta] = await banco.select().from(tarefas).where(eq(tarefas.id, aberta.id));
    const [atualConcluida] = await banco.select().from(tarefas).where(eq(tarefas.id, concluida.id));
    expect(atualAberta.responsavelId).toBe(bia.id);
    expect(atualConcluida.responsavelId).toBe(ana.id);
    expect(await banco.select().from(eventosTarefa).where(eq(eventosTarefa.tarefaId, aberta.id))).toHaveLength(1);
    expect(await mudarEstadoSerie(banco, ator, serie.id, 2, "pausar", "Equipe de férias", new Date("2026-10-08T12:00:00Z"))).toEqual({ ok: true });
    expect(await mudarEstadoSerie(banco, ator, serie.id, 3, "retomar", "", new Date("2026-10-21T12:00:00Z"))).toEqual({ ok: true });
    const [retomada] = await banco.select().from(seriesRecorrentes).where(eq(seriesRecorrentes.id, serie.id));
    expect(retomada.gerarDesde).toBe("2026-10-21");
    expect(await mudarEstadoSerie(banco, ator, serie.id, 4, "encerrar", "Não é mais necessário")).toEqual({ ok: true });
    expect(await editarSerie(banco, ator, serie.id, 5, dados)).toMatchObject({ ok: false });
    expect(await banco.select().from(eventosSerie).where(eq(eventosSerie.serieId, serie.id))).toHaveLength(5);
  });

  it("recusa responsável inativo e regra inválida", async () => {
    const { banco } = ctx;
    const ator = await criarConta(banco);
    const inativo = await criarConta(banco, { ativo: false, acessoRemovidoEm: new Date() });
    const [frente] = await banco.insert(frentes).values({ nome: "Operação" }).returning();
    const dados: DadosSerie = {
      titulo: "Teste", descricao: "", frenteId: frente.id, responsavelId: inativo.id,
      prioridade: "media", horaVencimento: null,
      regra: { frequencia: "diaria", intervalo: 1, inicioEm: "2026-10-01" },
    };
    expect(await criarSerie(banco, ator, dados, new Date("2026-10-01T12:00:00Z"))).toMatchObject({ ok: false });
    expect(await criarSerie(banco, ator, { ...dados, responsavelId: ator.id, regra: { ...dados.regra, intervalo: 0 } }, new Date("2026-10-01T12:00:00Z"))).toMatchObject({ ok: false });
  });

  it("reverte a coluna da migração 0008 no banco descartável", async () => {
    await ctx.pg.exec(readFileSync("db/rollback/0008_gerar_desde.down.sql", "utf8"));
    const { rows } = await ctx.pg.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM information_schema.columns WHERE table_name = 'series_recorrentes' AND column_name = 'gerar_desde'"
    );
    expect(rows[0].total).toBe(0);
  });
});
