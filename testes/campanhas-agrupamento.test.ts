import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Banco } from "@/db";
import {
  agruparCampanhas,
  criarFunil,
  listarAtribuicoes,
  listarFunis,
} from "@/lib/servidor/campanhas-funis-nucleo";
import { funilDaCampanha, montarDashboard, type DadosBrutos } from "@/lib/servidor/campanhas-nucleo";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

const HOJE = "2026-11-16";

function dados(parcial: Partial<DadosBrutos> = {}): DadosBrutos {
  return {
    funis: [
      { chave: "desafio", rotulo: "Desafio", papel: "entrada", ordem: 1 },
      { chave: "presencial", rotulo: "Presencial", papel: "entrada", ordem: 3 },
    ],
    atribuicoes: [],
    campanhas: [],
    metricas: [],
    vendas: [],
    frescor: { ultimaMetrica: null, ultimaSincronizacaoMeta: null, ultimaVenda: null },
    ...parcial,
  };
}

const camp = (id: string, funil: string | null) => ({
  metaCampaignId: id,
  nome: `camp ${id}`,
  status: "active",
  objetivo: null,
  funil,
  cidade: null,
  gastoTotal: 0,
  ultimaData: null,
});
const gasto = (id: string, valor: number) => ({
  dia: "2026-11-15",
  metaCampaignId: id,
  funil: null,
  cidade: null,
  gasto: valor,
  impressoes: 100,
  cliques: 1,
});

// O que o gestor salva no app vale por cima da sugestão pelo nome.
describe("agrupamento manual no cálculo", () => {
  const funis = new Set(["desafio", "presencial"]);

  it("o manual vence a sugestão; sem manual vale a sugestão; funil inexistente é ignorado", () => {
    const m = new Map([["a", { metaCampaignId: "a", funil: "presencial", foraDoEscopo: false }]]);
    expect(funilDaCampanha("a", "desafio", m, funis)).toEqual({ funil: "presencial", origem: "manual" });
    expect(funilDaCampanha("b", "desafio", m, funis)).toEqual({ funil: "desafio", origem: "sugestao" });
    expect(funilDaCampanha("c", null, m, funis)).toEqual({ funil: null, origem: "nenhuma" });
    expect(funilDaCampanha("d", "inexistente", m, funis)).toEqual({ funil: null, origem: "nenhuma" });
    const apagado = new Map([["e", { metaCampaignId: "e", funil: "sumiu", foraDoEscopo: false }]]);
    expect(funilDaCampanha("e", "desafio", apagado, funis).origem).toBe("sugestao");
  });

  it("move o gasto da campanha para o funil escolhido, mesmo sem sugestão pelo nome", () => {
    const d = montarDashboard(
      dados({
        campanhas: [camp("vsl", null), camp("x", "desafio")],
        metricas: [gasto("vsl", 300), gasto("x", 100)],
        atribuicoes: [{ metaCampaignId: "vsl", funil: "desafio", foraDoEscopo: false }],
      }),
      30,
      HOJE
    );
    expect(d.funis.find((f) => f.funil === "desafio")!.gasto).toBe(400);
    expect(d.qualidade.campanhasSemFunil).toHaveLength(0);
    expect(d.campanhas.find((c) => c.metaCampaignId === "vsl")!.origemFunil).toBe("manual");
  });

  it("o manual tira a campanha do funil sugerido pelo nome", () => {
    const d = montarDashboard(
      dados({
        campanhas: [camp("x", "desafio")],
        metricas: [gasto("x", 100)],
        atribuicoes: [{ metaCampaignId: "x", funil: "presencial", foraDoEscopo: false }],
      }),
      30,
      HOJE
    );
    expect(d.funis.find((f) => f.funil === "desafio")!.gasto).toBe(0);
    expect(d.funis.find((f) => f.funil === "presencial")!.gasto).toBe(100);
  });

  it("fora do escopo sai dos totais e da fila de qualidade, e aparece à parte", () => {
    const d = montarDashboard(
      dados({
        campanhas: [camp("perfil", null)],
        metricas: [gasto("perfil", 250)],
        atribuicoes: [{ metaCampaignId: "perfil", funil: null, foraDoEscopo: true }],
      }),
      30,
      HOJE
    );
    expect(d.total.gasto).toBe(0);
    expect(d.foraDoEscopo).toEqual({ campanhas: 1, gasto: 250 });
    expect(d.qualidade.campanhasSemFunil).toHaveLength(0);
  });

  it("campanha sem agrupamento nem sugestão fica na fila e conta como sem funil", () => {
    const d = montarDashboard(dados({ campanhas: [camp("n", null)], metricas: [gasto("n", 50)] }), 30, HOJE);
    expect(d.qualidade.campanhasSemFunil.map((c) => c.metaCampaignId)).toEqual(["n"]);
    expect(d.funis.find((f) => f.funil === "sem-funil")!.gasto).toBe(50);
  });
});

describe("salvar agrupamento no banco da gestão", () => {
  let banco: Banco;
  let pg: Awaited<ReturnType<typeof criarBancoDeTeste>>["pg"];
  const conhecidas = new Map([
    ["a", "Camp A"],
    ["b", "Camp B"],
    ["c", "Camp C"],
  ]);

  beforeAll(async () => {
    ({ banco, pg } = await criarBancoDeTeste());
  });
  afterAll(async () => {
    await pg.close();
  });
  beforeEach(async () => {
    await limparBanco(pg);
    // limparBanco esvazia tudo, inclusive os funis da migração: recoloca alguns.
    await pg.exec(`INSERT INTO funis_campanha (chave, rotulo, papel, ordem) VALUES
      ('desafio','Desafio','entrada',1),('presencial','Presencial','entrada',3),('mentoria','Mentoria','backend',8)`);
  });

  const gestor = () => criarConta(banco, { dono: true, gerenciaAcessos: true });

  it("a migração semeia os funis iniciais", async () => {
    const { banco: outro, pg: pg2 } = await criarBancoDeTeste();
    const chaves = (await listarFunis(outro)).map((f) => f.chave);
    expect(chaves).toEqual(["desafio", "precificacao", "presencial", "imersao", "form_antes", "live", "grupo_vip", "mentoria", "analise_perfil"]);
    await pg2.close();
  });

  it("só gestor agrupa; colaborador comum é recusado e nada é gravado", async () => {
    const comum = await criarConta(banco, {});
    const r = await agruparCampanhas(banco, comum, ["a"], { tipo: "funil", chave: "desafio" }, conhecidas);
    expect(r.ok).toBe(false);
    expect(await listarAtribuicoes(banco)).toEqual([]);
  });

  it("junta várias campanhas num funil e guarda o nome da fonte, não o do formulário", async () => {
    const g = await gestor();
    const r = await agruparCampanhas(banco, g, ["a", "b"], { tipo: "funil", chave: "desafio" }, conhecidas);
    expect(r).toEqual({ ok: true, alteradas: 2 });
    const atribs = await listarAtribuicoes(banco);
    expect(atribs.map((a) => [a.metaCampaignId, a.funil]).sort()).toEqual([
      ["a", "desafio"],
      ["b", "desafio"],
    ]);
    const { rows } = await pg.query<{ nome_na_epoca: string }>(
      "select nome_na_epoca from campanha_funil where meta_campaign_id = 'a'"
    );
    expect(rows[0].nome_na_epoca).toBe("Camp A");
  });

  it("mover de funil troca o destino sem duplicar a linha", async () => {
    const g = await gestor();
    await agruparCampanhas(banco, g, ["a"], { tipo: "funil", chave: "desafio" }, conhecidas);
    await agruparCampanhas(banco, g, ["a"], { tipo: "funil", chave: "presencial" }, conhecidas);
    expect(await listarAtribuicoes(banco)).toEqual([{ metaCampaignId: "a", funil: "presencial", foraDoEscopo: false }]);
  });

  it("fora do escopo e voltar para a sugestão", async () => {
    const g = await gestor();
    await agruparCampanhas(banco, g, ["c"], { tipo: "fora" }, conhecidas);
    expect(await listarAtribuicoes(banco)).toEqual([{ metaCampaignId: "c", funil: null, foraDoEscopo: true }]);
    await agruparCampanhas(banco, g, ["c"], { tipo: "sugestao" }, conhecidas);
    expect(await listarAtribuicoes(banco)).toEqual([]);
  });

  it("recusa campanha que a fonte não conhece, lote vazio e funil inexistente", async () => {
    const g = await gestor();
    expect((await agruparCampanhas(banco, g, ["zzz"], { tipo: "funil", chave: "desafio" }, conhecidas)).ok).toBe(false);
    expect((await agruparCampanhas(banco, g, [], { tipo: "funil", chave: "desafio" }, conhecidas)).ok).toBe(false);
    expect((await agruparCampanhas(banco, g, ["a"], { tipo: "funil", chave: "nao-existe" }, conhecidas)).ok).toBe(false);
    expect(await listarAtribuicoes(banco)).toEqual([]);
  });

  it("cria funil novo com chave única e no fim da ordem, sem repetir nome", async () => {
    const g = await gestor();
    expect(await criarFunil(banco, g, { rotulo: "  Live   Direto ao Ponto " })).toEqual({ ok: true, chave: "live_direto_ao_ponto" });
    expect((await criarFunil(banco, g, { rotulo: "live direto ao ponto" })).ok).toBe(false);
    expect((await criarFunil(banco, g, { rotulo: "x" })).ok).toBe(false);
    expect((await criarFunil(banco, g, { rotulo: "Ok", papel: "inventado" })).ok).toBe(false);
    const comum = await criarConta(banco, {});
    expect((await criarFunil(banco, comum, { rotulo: "Outro funil" })).ok).toBe(false);
    const funis = await listarFunis(banco);
    expect(funis.at(-1)!.chave).toBe("live_direto_ao_ponto");
  });

  it("o banco recusa linha sem destino ou com destino duplo", async () => {
    await expect(pg.query("insert into campanha_funil (meta_campaign_id, nome_na_epoca) values ('q', 'Q')")).rejects.toThrow();
    const { rows } = await pg.query<{ id: string }>("select id from funis_campanha limit 1");
    await expect(
      pg.query(
        "insert into campanha_funil (meta_campaign_id, funil_id, fora_do_escopo, nome_na_epoca) values ('q', $1, true, 'Q')",
        [rows[0].id]
      )
    ).rejects.toThrow();
  });
});
