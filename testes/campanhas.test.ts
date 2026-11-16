import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  fatorImposto,
  intervalo,
  lerDados,
  montarDashboard,
  periodoValido,
  type DadosBrutos,
  type ImpostoConfig,
  type Leitor,
} from "@/lib/servidor/campanhas-nucleo";
import { podeVerCampanhas } from "@/lib/servidor/permissoes";
import { rotaVisivel } from "@/lib/rotas";

const HOJE = "2026-11-16";
const IMPOSTO: ImpostoConfig = {
  iss: 0.029,
  pisCofins: 0.0925,
  modo: "soma_simples",
  vigenciaInicio: "2026-01-01",
  vigenciaFim: null,
  fonte: "estimativa",
};

function dados(parcial: Partial<DadosBrutos> = {}): DadosBrutos {
  return {
    funis: [
      { chave: "desafio", rotulo: "Desafio", papel: "entrada", ordem: 1 },
      { chave: "presencial", rotulo: "Presencial", papel: "entrada", ordem: 3 },
      { chave: "grupo_vip", rotulo: "Grupo VIP", papel: "etapa", ordem: 7 },
      { chave: "mentoria", rotulo: "Mentoria", papel: "backend", ordem: 8 },
    ],
    atribuicoes: [],
    campanhas: [],
    metricas: [],
    vendas: [],
    imposto: [IMPOSTO],
    frescor: { ultimaMetrica: null, ultimaSincronizacaoMeta: null, ultimaVenda: null },
    ...parcial,
  };
}

const venda = (o: Partial<DadosBrutos["vendas"][number]>): DadosBrutos["vendas"][number] => ({
  dia: "2026-11-15",
  funil: "desafio",
  produto: "Desafio",
  status: "approved",
  moeda: "BRL",
  valor: 20,
  comprador: "a",
  ...o,
});

describe("imposto estimado da Meta", () => {
  it("soma simples: 1.000 de gasto viram 1.121,50", () => {
    expect(fatorImposto([IMPOSTO], "2026-11-01")! * 1000).toBeCloseTo(1121.5, 5);
  });
  it("cascata multiplica os dois", () => {
    const f = fatorImposto([{ ...IMPOSTO, modo: "cascata" }], "2026-11-01")!;
    expect(f).toBeCloseTo(1.029 * 1.0925, 8);
  });
  it("sem configuração vigente devolve null", () => {
    expect(fatorImposto([], "2026-11-01")).toBeNull();
    expect(fatorImposto([{ ...IMPOSTO, vigenciaFim: "2026-06-30" }], "2026-11-01")).toBeNull();
    expect(fatorImposto([IMPOSTO], "2025-12-31")).toBeNull();
  });
});

describe("período", () => {
  it("aceita só 7, 30 e 90, padrão 30", () => {
    expect(periodoValido("7")).toBe(7);
    expect(periodoValido("90")).toBe(90);
    expect(periodoValido("15")).toBe(30);
    expect(periodoValido(undefined)).toBe(30);
  });
  it("intervalo inclui hoje e tem N dias", () => {
    expect(intervalo(7, HOJE)).toEqual({ de: "2026-11-10", ate: HOJE });
  });
});

describe("montarDashboard", () => {
  it("separa gasto e receita por funil, com ROAS sobre o gasto com imposto", () => {
    const d = montarDashboard(
      dados({
        metricas: [
          { dia: "2026-11-15", metaCampaignId: "1", funil: "desafio", cidade: null, gasto: 1000, impressoes: 10000, cliques: 200 },
          { dia: "2026-11-15", metaCampaignId: "2", funil: "presencial", cidade: "Recife", gasto: 500, impressoes: 5000, cliques: 50 },
        ],
        vendas: [venda({ valor: 20, comprador: "a" }), venda({ valor: 20, comprador: "b" })],
      }),
      30,
      HOJE
    );
    const desafio = d.funis.find((f) => f.funil === "desafio")!;
    expect(desafio.gasto).toBe(1000);
    expect(desafio.gastoComImposto).toBeCloseTo(1121.5, 5);
    expect(desafio.vendas).toBe(2);
    expect(desafio.receita).toBe(40);
    expect(desafio.roas).toBeCloseTo(40 / 1121.5, 6);
    expect(desafio.cpa).toBeCloseTo(1121.5 / 2, 5);
    expect(desafio.ctr).toBeCloseTo(2, 5);
    expect(d.total.gasto).toBe(1500);
    expect(d.cidades).toEqual([{ cidade: "Recife", gasto: 500, gastoComImposto: expect.closeTo(560.75, 5) }]);
  });

  it("sem imposto configurado, mostra só o gasto da API e usa ele no ROAS", () => {
    const d = montarDashboard(
      dados({
        imposto: [],
        metricas: [{ dia: "2026-11-15", metaCampaignId: "1", funil: "desafio", cidade: null, gasto: 100, impressoes: 1000, cliques: 10 }],
        vendas: [venda({ valor: 50 })],
      }),
      30,
      HOJE
    );
    const f = d.funis.find((x) => x.funil === "desafio")!;
    expect(f.gastoComImposto).toBeNull();
    expect(f.roas).toBeCloseTo(0.5, 6);
    expect(d.qualidade.impostoConfigurado).toBe(false);
  });

  it("não conta pendente, cancelada nem outra moeda como receita; reembolso fica à parte", () => {
    const d = montarDashboard(
      dados({
        vendas: [
          venda({ comprador: "a", valor: 20 }),
          venda({ comprador: "b", status: "pending", valor: 20 }),
          venda({ comprador: "c", status: "canceled", valor: 20 }),
          venda({ comprador: "d", moeda: "EUR", valor: 30 }),
          venda({ comprador: "e", status: "refunded", valor: 20 }),
          venda({ comprador: "f", status: "chargeback", valor: 10 }),
        ],
      }),
      30,
      HOJE
    );
    const f = d.funis.find((x) => x.funil === "desafio")!;
    expect(f.vendas).toBe(1);
    expect(f.receita).toBe(20);
    expect(f.reembolsado).toBe(30);
    expect(f.vendasOutraMoeda).toBe(1);
  });

  it("ignora o que está fora do período", () => {
    const d = montarDashboard(
      dados({
        metricas: [{ dia: "2026-08-01", metaCampaignId: "1", funil: "desafio", cidade: null, gasto: 999, impressoes: 1, cliques: 1 }],
        vendas: [venda({ dia: "2026-08-01" })],
      }),
      7,
      HOJE
    );
    expect(d.total.gasto).toBe(0);
    expect(d.total.vendas).toBe(0);
  });

  it("produto sem funil vai para a fila de qualidade, sem ratear em outro funil", () => {
    const d = montarDashboard(
      dados({ vendas: [venda({ funil: null, produto: "Produto novo", comprador: "z", valor: 77 })] }),
      30,
      HOJE
    );
    expect(d.qualidade.produtosSemFunil).toEqual([{ produto: "Produto novo", vendas: 1, valor: 77 }]);
    expect(d.funis.find((f) => f.funil === "desafio")!.vendas).toBe(0);
    expect(d.funis.some((f) => f.funil === "sem-funil")).toBe(true);
  });

  it("campanha sem funil aparece na qualidade", () => {
    const d = montarDashboard(
      dados({
        campanhas: [
          { metaCampaignId: "9", nome: "Engajamento | Top Posts", status: "active", objetivo: null, funil: null, cidade: null, gastoTotal: 10, ultimaData: null },
        ],
      }),
      30,
      HOJE
    );
    expect(d.qualidade.campanhasSemFunil).toHaveLength(1);
  });

  it("passagem Desafio → Grupo VIP → Mentoria conta pessoas, não vendas", () => {
    const d = montarDashboard(
      dados({
        vendas: [
          venda({ comprador: "a" }),
          venda({ comprador: "a" }), // mesma pessoa comprando duas vezes
          venda({ comprador: "b" }),
          venda({ comprador: "c" }),
          venda({ comprador: "d" }),
          venda({ funil: "grupo_vip", produto: "Grupo VIP", comprador: "a", valor: 10 }),
          venda({ funil: "grupo_vip", produto: "Grupo VIP", comprador: "b", valor: 10 }),
          venda({ funil: "mentoria", produto: "Mentoria", comprador: "a", valor: 3000 }),
        ],
      }),
      30,
      HOJE
    );
    const [dv, vm, dm] = d.etapas;
    expect([dv.base, dv.passaram, dv.taxa]).toEqual([4, 2, 0.5]);
    expect([vm.base, vm.passaram, vm.taxa]).toEqual([2, 1, 0.5]);
    expect([dm.base, dm.passaram]).toEqual([4, 1]);
    // Mentoria e Grupo VIP não têm gasto próprio: sem ROAS nem CPA inventados.
    const mentoria = d.funis.find((f) => f.funil === "mentoria")!;
    expect([mentoria.roas, mentoria.cpa]).toEqual([null, null]);
  });
});

describe("permissão", () => {
  const base = { id: "1", ativo: true, dono: false, gerenciaAcessos: false };
  it("só dono e gestor de acessos veem campanhas", () => {
    expect(podeVerCampanhas({ ...base })).toBe(false);
    expect(podeVerCampanhas({ ...base, dono: true })).toBe(true);
    expect(podeVerCampanhas({ ...base, gerenciaAcessos: true })).toBe(true);
    expect(podeVerCampanhas({ ...base, dono: true, ativo: false })).toBe(false);
  });
  it("a rota some do menu de quem não é gestor", () => {
    expect(rotaVisivel("/campanhas", false)).toBe(false);
    expect(rotaVisivel("/campanhas", true)).toBe(true);
    expect(rotaVisivel("/quadro", false)).toBe(true);
  });
});

// O SQL das views, rodado de verdade (Postgres em memória) sobre as tabelas do Dashboard-italo.
describe("db/dashboard-italo/001-views-funil.sql", () => {
  let pg: PGlite;
  let leitor: Leitor;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      create table campaigns (id uuid primary key default gen_random_uuid(), meta_campaign_id text, name text, objective text, status text);
      create table campaign_daily_metrics (id uuid primary key default gen_random_uuid(), campaign_id uuid, date date, impressions bigint, clicks bigint, spend numeric, reach bigint, updated_at timestamptz default now());
      create table sales (id uuid primary key default gen_random_uuid(), product_name text, status text, currency text, amount numeric, occurred_at timestamptz, buyer_email text);
    `);
    let sql = readFileSync("db/dashboard-italo/001-views-funil.sql", "utf8");
    // PGlite não tem o gerenciamento de roles do Supabase: roda tudo menos a seção 6.
    sql = sql.slice(0, sql.indexOf("-- 6. Fechar o acesso")) + "commit;";
    await pg.exec(sql);

    await pg.exec(`
      insert into campaigns (id, meta_campaign_id, name, status) values
        ('00000000-0000-0000-0000-000000000001', 'c1', '[L43]_[VENDAS]_[DESAFIO]_[C2]_[VÍDEO]_[LP2]', 'active'),
        ('00000000-0000-0000-0000-000000000002', 'c2', '[L75]_[PRESENCIAL]_[SANTA-CRUZ]_[VENDA]', 'active'),
        ('00000000-0000-0000-0000-000000000003', 'c3', '[REMARKETING]_[PRESENCIAL]_[CHECKOUT-ABANDONADO]', 'active'),
        ('00000000-0000-0000-0000-000000000004', 'c4', 'Engajamento | Top Posts 30 dias', 'active');
      insert into campaign_daily_metrics (campaign_id, date, impressions, clicks, spend) values
        ('00000000-0000-0000-0000-000000000001', '2026-11-15', 1000, 20, 100),
        ('00000000-0000-0000-0000-000000000002', '2026-11-15', 500, 5, 50),
        ('00000000-0000-0000-0000-000000000004', '2026-11-15', 100, 1, 5);
      insert into sales (product_name, status, currency, amount, occurred_at, buyer_email) values
        ('Desafio: VENDA todo dia! [ENTRE NO GRUPO DO WHATSAPP + AULA SEGUNDA 20H]', 'approved', 'BRL', 20, '2026-11-15T15:00:00Z', 'Ana@Exemplo.com'),
        ('Como montar um GRUPO VIP lucrativo, que vende DIARIAMENTE!', 'approved', 'BRL', 10, '2026-11-15T16:00:00Z', 'ana@exemplo.com '),
        ('[ENTRADA] Mentoria Donas de Loja', 'approved', 'BRL', 3000, '2026-11-15T17:00:00Z', 'ana@exemplo.com'),
        ('Mentoria Aceleradora das Lojas - Recorrência', 'approved', 'BRL', 900, '2026-11-15T17:00:00Z', 'bia@exemplo.com'),
        ('ANÁLISE DE PERFIL da sua Loja!', 'approved', 'BRL', 25, '2026-11-15T17:00:00Z', 'bia@exemplo.com'),
        ('Calculadora de PRECIFICAÇÃO + Aula de como PRECIFICAR!', 'approved', 'BRL', 27, '2026-11-15T17:00:00Z', 'cris@exemplo.com'),
        ('Donas de Loja em Belém | 15/09: 19h às 21h30', 'approved', 'BRL', 87, '2026-11-15T17:00:00Z', 'dani@exemplo.com'),
        ('Santa Cruz Presencial Donas de Loja | 12/11', 'approved', 'BRL', 97, '2026-11-15T17:00:00Z', 'eli@exemplo.com'),
        ('Produto Hotmart', 'approved', 'BRL', 1, '2026-11-15T17:00:00Z', 'x@exemplo.com'),
        ('Desafio: VENDA todo dia!', 'pending', 'BRL', 0, '2026-11-15T17:00:00Z', 'pend@exemplo.com');
    `);
    leitor = {
      async consultar<T>(sql: string, params: unknown[] = []) {
        const r = await pg.query(sql, params);
        return r.rows as T[];
      },
    };
  });

  it("classifica campanhas pelo código do nome e extrai a cidade", async () => {
    const r = await pg.query<{ nome: string; funil: string | null; cidade: string | null }>(
      "select nome, funil, cidade from v_gestao_campanhas order by nome"
    );
    const por = Object.fromEntries(r.rows.map((x) => [x.nome.slice(0, 12), [x.funil, x.cidade]]));
    expect(por["[L43]_[VENDA"]).toEqual(["desafio", null]);
    expect(por["[L75]_[PRESE"]).toEqual(["presencial", "Santa Cruz"]);
    expect(por["[REMARKETING"]).toEqual(["presencial", null]);
    expect(por["Engajamento "]).toEqual([null, null]);
  });

  it("classifica produtos e nunca expõe e-mail do comprador", async () => {
    const r = await pg.query<Record<string, unknown>>("select * from v_gestao_vendas");
    expect(r.rows[0]).not.toHaveProperty("buyer_email");
    expect(Object.keys(r.rows[0]).sort()).toEqual(["comprador", "dia", "funil", "moeda", "produto", "status", "valor"]);
    const f = Object.fromEntries(r.rows.map((x) => [String(x.produto).slice(0, 14), x.funil]));
    expect(f["Desafio: VENDA"]).toBe("desafio");
    expect(f["Como montar um"]).toBe("grupo_vip");
    expect(f["[ENTRADA] Ment"]).toBe("mentoria");
    expect(f["Mentoria Acele"]).toBe("mentoria");
    expect(f["ANÁLISE DE PER"]).toBe("analise_perfil");
    expect(f["Calculadora de"]).toBe("precificacao");
    expect(f["Donas de Loja "]).toBe("presencial");
    expect(f["Santa Cruz Pre"]).toBe("presencial");
    expect(f["Produto Hotmar"]).toBeNull();
  });

  it("o hash agrupa o mesmo comprador mesmo com maiúsculas e espaços no e-mail", async () => {
    const r = await pg.query<{ n: number }>(
      "select count(distinct comprador)::int n from v_gestao_vendas where funil in ('desafio','grupo_vip','mentoria') and status='approved' and valor in (20,10,3000)"
    );
    expect(r.rows[0].n).toBe(1);
  });

  it("de ponta a ponta: lê as views e monta o dashboard", async () => {
    const cadastro = {
      funis: dados().funis.concat([
        { chave: "precificacao", rotulo: "Precificação", papel: "entrada", ordem: 2 },
        { chave: "analise_perfil", rotulo: "Análise de Perfil", papel: "complemento", ordem: 9 },
      ]),
      atribuicoes: [],
    };
    const d = montarDashboard(await lerDados(leitor, 30, HOJE, cadastro), 30, HOJE);
    const desafio = d.funis.find((f) => f.funil === "desafio")!;
    expect(desafio.gasto).toBe(100);
    expect(desafio.vendas).toBe(1);
    expect(desafio.receita).toBe(20);
    expect(d.funis.find((f) => f.funil === "presencial")!.vendas).toBe(2);
    expect(d.cidades[0].cidade).toBe("Santa Cruz");
    expect(d.qualidade.campanhasSemFunil.map((c) => c.metaCampaignId)).toEqual(["c4"]);
    expect(d.qualidade.produtosSemFunil.map((p) => p.produto)).toEqual(["Produto Hotmart"]);
    expect(d.etapas[0]).toMatchObject({ base: 1, passaram: 1 });
    expect(d.qualidade.impostoConfigurado).toBe(true);
    expect(d.funis.find((f) => f.funil === "desafio")!.gastoComImposto).toBeCloseTo(112.15, 5);
  });
});
