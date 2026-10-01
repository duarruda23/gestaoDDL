import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { eventosSerie, frentes, seriesRecorrentes, tarefas } from "@/db/schema";
import { criarBancoDeTeste, criarConta } from "./banco";

describe("banco de recorrência", () => {
  let ctx: Awaited<ReturnType<typeof criarBancoDeTeste>>;
  beforeAll(async () => { ctx = await criarBancoDeTeste(); });
  afterAll(async () => { await ctx.pg.close(); });

  it("migra, grava série e impede ocorrência duplicada ou incompleta", async () => {
    const { banco, pg } = ctx;
    const autor = await criarConta(banco);
    const responsavel = await criarConta(banco);
    const [frente] = await banco.insert(frentes).values({ nome: "Eventos" }).returning();
    const [serie] = await banco.insert(seriesRecorrentes).values({
      titulo: "Publicar agenda", frenteId: frente.id, responsavelId: responsavel.id,
      criadoPorId: autor.id, frequencia: "semanal", diasSemana: [2], inicioEm: "2026-10-06", gerarDesde: "2026-10-06",
    }).returning();
    const ocorrencia = {
      titulo: serie.titulo, frenteId: frente.id, responsavelId: responsavel.id,
      criadorId: autor.id, estado: "a_fazer" as const, prazo: "2026-10-06",
      serieRecorrenteId: serie.id, chaveOcorrencia: "2026-10-06",
      dataProgramadaLocal: "2026-10-06", geradaEm: new Date("2026-10-06T03:00:00Z"),
      origemOcorrencia: "automatica" as const,
    };
    await banco.insert(tarefas).values(ocorrencia);
    await expect(banco.insert(tarefas).values(ocorrencia)).rejects.toThrow();
    await expect(banco.insert(tarefas).values({ ...ocorrencia, chaveOcorrencia: null })).rejects.toThrow();
    expect(await banco.select().from(tarefas).where(eq(tarefas.serieRecorrenteId, serie.id))).toHaveLength(1);
    const [evento] = await banco.insert(eventosSerie).values({
      serieId: serie.id, tipo: "criada", atorId: autor.id, depois: { frequencia: "semanal" },
    }).returning();
    await expect(banco.update(eventosSerie).set({ tipo: "alterada" }).where(eq(eventosSerie.id, evento.id))).rejects.toThrow();
    await expect(pg.query(
      "INSERT INTO series_recorrentes (titulo, frente_id, responsavel_id, criado_por_id, frequencia, inicio_em, dias_semana) VALUES ('X', $1, $2, $3, 'semanal', '2026-10-06', ARRAY[9])",
      [frente.id, responsavel.id, autor.id]
    )).rejects.toThrow();
  });

  it("reverte a migração em banco descartável", async () => {
    const sql = readFileSync("db/rollback/0007_recorrencia.down.sql", "utf8");
    await ctx.pg.exec(sql);
    const { rows } = await ctx.pg.query<{ serie: string | null }>(
      "SELECT to_regclass('public.series_recorrentes')::text AS serie"
    );
    expect(rows[0].serie).toBeNull();
  });
});
