import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { frentes, mensagens, seriesRecorrentes, tarefas, usuarios } from "@/db/schema";
import { criarSerie, mudarEstadoSerie, type DadosSerie } from "@/lib/servidor/series-nucleo";
import { materializarRecorrencias, materializarSerie } from "@/lib/servidor/materializar-recorrencias";
import { cobrarTarefa } from "@/lib/servidor/cobranca-nucleo";
import { gerarCobrancasAutomaticas } from "@/lib/servidor/regras-cobranca";
import { reservarMensagens } from "@/lib/servidor/n8n-nucleo";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

let banco: Banco;
let pg: PGlite;
let ator: Awaited<ReturnType<typeof criarConta>>;
let responsavel: Awaited<ReturnType<typeof criarConta>>;
let frenteId: string;

beforeAll(async () => { ({ banco, pg } = await criarBancoDeTeste()); });
beforeEach(async () => {
  await limparBanco(pg);
  ator = await criarConta(banco);
  responsavel = await criarConta(banco);
  [{ id: frenteId }] = await banco.insert(frentes).values({ nome: "Operação" }).returning();
});

const instante = (data: string) => new Date(`${data}T12:00:00Z`); // 09h em Recife
async function serie(regra: DadosSerie["regra"]) {
  const r = await criarSerie(banco, ator, {
    titulo: "Agenda", descricao: "Publicar", frenteId, responsavelId: responsavel.id,
    prioridade: "media", horaVencimento: "15:00", regra,
  }, instante(regra.inicioEm));
  if (!r.ok) throw new Error(r.motivo);
  return r.id;
}
const ocorrencias = (id: string) => banco.select().from(tarefas).where(eq(tarefas.serieRecorrenteId, id));

describe("materializador de recorrências", () => {
  it("só cobra a ocorrência às 09h e confere o vencimento de novo na reserva", async () => {
    await banco.update(usuarios).set({ telefoneWhatsapp: "81999990000" }).where(eq(usuarios.id, responsavel.id));
    const r = await criarSerie(banco, ator, {
      titulo: "Agenda", descricao: "", frenteId, responsavelId: responsavel.id,
      prioridade: "media", horaVencimento: "09:00",
      regra: { frequencia: "semanal", intervalo: 1, inicioEm: "2026-10-06", diasSemana: [2] },
    }, new Date("2026-10-06T11:00:00Z"));
    if (!r.ok) throw new Error(r.motivo);
    await materializarSerie(banco, r.id, new Date("2026-10-06T11:00:00Z"));
    const [t] = await ocorrencias(r.id);
    const antes = new Date("2026-10-06T11:59:59Z");
    const noPrazo = new Date("2026-10-06T12:00:00Z");
    expect(await cobrarTarefa(banco, ator, t.id, "", "2026-10-06", antes)).toMatchObject({ ok: false });
    expect(await gerarCobrancasAutomaticas(banco, "2026-10-06", "08:59", antes)).toMatchObject({ novas: 0 });
    expect(await banco.select().from(mensagens)).toHaveLength(0);
    expect(await cobrarTarefa(banco, ator, t.id, "", "2026-10-06", noPrazo)).toMatchObject({ ok: true });
    expect(await gerarCobrancasAutomaticas(banco, "2026-10-06", "09:00", noPrazo)).toMatchObject({ novas: 1 });
    await banco.update(mensagens).set({ agendadaPara: antes });
    expect((await reservarMensagens(banco, 10, antes)).mensagens).toHaveLength(0);
    expect((await reservarMensagens(banco, 10, noPrazo)).mensagens).toHaveLength(2);
    expect((await reservarMensagens(banco, 10, noPrazo)).mensagens).toHaveLength(0);
    expect((await ocorrencias(r.id)).map((x) => x.dataProgramadaLocal)).toEqual(["2026-10-06"]);
  });
  it("cria só no dia de terça, repete com segurança e não enfileira mensagens", async () => {
    const id = await serie({ frequencia: "semanal", intervalo: 1, inicioEm: "2026-10-06", diasSemana: [2] });
    expect(await materializarSerie(banco, id, instante("2026-10-06"))).toMatchObject({ criadas: 1, requerAtencao: false });
    expect(await materializarSerie(banco, id, instante("2026-10-06"))).toMatchObject({ criadas: 0, jaExistiam: 1 });
    expect((await ocorrencias(id)).map((t) => t.dataProgramadaLocal)).toEqual(["2026-10-06"]);
    expect(await banco.select().from(mensagens)).toHaveLength(0);
    expect(await materializarSerie(banco, id, instante("2026-10-13"))).toMatchObject({ criadas: 1 });
    expect((await ocorrencias(id)).map((t) => t.dataProgramadaLocal).sort()).toEqual(["2026-10-06", "2026-10-13"]);
  });

  it("terça e quinta são tarefas separadas; quinta não nasce na terça", async () => {
    const id = await serie({ frequencia: "personalizada", intervalo: 1, inicioEm: "2026-10-06", diasSemana: [2, 4] });
    await materializarSerie(banco, id, instante("2026-10-06"));
    expect((await ocorrencias(id)).map((t) => t.prazo)).toEqual(["2026-10-06"]);
    await materializarSerie(banco, id, instante("2026-10-08"));
    expect((await ocorrencias(id)).map((t) => t.prazo).sort()).toEqual(["2026-10-06", "2026-10-08"]);
  });

  it("até duas atrasadas e a vigente; a quarta bloqueia e pede ação humana", async () => {
    const id = await serie({ frequencia: "diaria", intervalo: 1, inicioEm: "2026-10-06" });
    expect(await materializarSerie(banco, id, instante("2026-10-08"))).toMatchObject({ criadas: 3, requerAtencao: true, motivo: "limite" });
    expect(await materializarSerie(banco, id, instante("2026-10-09"))).toMatchObject({ criadas: 0, requerAtencao: true });
    expect(await ocorrencias(id)).toHaveLength(3);
    const primeira = (await ocorrencias(id)).find((t) => t.prazo === "2026-10-06")!;
    await banco.update(tarefas).set({ estado: "concluida" }).where(eq(tarefas.id, primeira.id));
    expect(await materializarSerie(banco, id, instante("2026-10-09"))).toMatchObject({ criadas: 1, requerAtencao: true });
    expect((await ocorrencias(id)).map((t) => t.prazo).sort()).toEqual(["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(await banco.select().from(mensagens)).toHaveLength(0);
  });

  it("retomar não cria datas do período pausado", async () => {
    const id = await serie({ frequencia: "diaria", intervalo: 1, inicioEm: "2026-10-06" });
    await materializarSerie(banco, id, instante("2026-10-06"));
    expect(await mudarEstadoSerie(banco, ator, id, 1, "pausar", "Férias", instante("2026-10-07"))).toMatchObject({ ok: true });
    expect(await materializarSerie(banco, id, instante("2026-10-08"))).toMatchObject({ criadas: 0 });
    expect(await mudarEstadoSerie(banco, ator, id, 2, "retomar", "", instante("2026-10-09"))).toMatchObject({ ok: true });
    await materializarSerie(banco, id, instante("2026-10-09"));
    expect((await ocorrencias(id)).map((t) => t.prazo).sort()).toEqual(["2026-10-06", "2026-10-09"]);
  });

  it("responsável inativo bloqueia geração sem atribuir ao criador", async () => {
    const id = await serie({ frequencia: "diaria", intervalo: 1, inicioEm: "2026-10-06" });
    await banco.update(usuarios).set({ ativo: false, acessoRemovidoEm: instante("2026-10-06") })
      .where(eq(usuarios.id, responsavel.id));
    expect(await materializarSerie(banco, id, instante("2026-10-06"))).toMatchObject({ criadas: 0, requerAtencao: true, motivo: "responsavel_inativo" });
    expect(await ocorrencias(id)).toHaveLength(0);
  });

  it("duas execuções do lote para a mesma data não duplicam", async () => {
    const id = await serie({ frequencia: "semanal", intervalo: 1, inicioEm: "2026-10-06", diasSemana: [2] });
    await materializarRecorrencias(banco, instante("2026-10-06"));
    await materializarRecorrencias(banco, instante("2026-10-06"));
    expect(await ocorrencias(id)).toHaveLength(1);
  });

  it("duas chamadas simultâneas para a mesma série não duplicam", async () => {
    const id = await serie({ frequencia: "semanal", intervalo: 1, inicioEm: "2026-10-06", diasSemana: [2] });
    const resultados = await Promise.all([
      materializarSerie(banco, id, instante("2026-10-06")),
      materializarSerie(banco, id, instante("2026-10-06")),
    ]);
    expect(resultados.reduce((soma, r) => soma + r.criadas, 0)).toBe(1);
    expect(await ocorrencias(id)).toHaveLength(1);
  });

  it("falha numa série não impede materializar outra", async () => {
    const quebrada = await serie({ frequencia: "semanal", intervalo: 1, inicioEm: "2026-10-06", diasSemana: [2] });
    const boa = await serie({ frequencia: "diaria", intervalo: 1, inicioEm: "2026-10-06" });
    // O banco valida a faixa, mas a validação completa de duplicatas fica no domínio.
    await banco.update(seriesRecorrentes).set({ diasSemana: [2, 2] }).where(eq(seriesRecorrentes.id, quebrada));
    const rodada = await materializarRecorrencias(banco, instante("2026-10-06"));
    expect(rodada.falhas).toHaveLength(1);
    expect(rodada.falhas[0].serieId).toBe(quebrada);
    expect(await ocorrencias(boa)).toHaveLength(1);
  });
});
