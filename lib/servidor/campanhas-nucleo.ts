// Dashboard de campanhas por funil: leitura das views v_gestao_* do Supabase
// "Dashboard-italo" (db/dashboard-italo/001-views-funil.sql) e cálculo dos números.
//
// Atenção ao que os números significam: a venda da Hotmart NÃO traz a campanha
// (sales.campaign_id é nulo). Então o gasto vem da campanha (tag do nome → funil)
// e a receita vem do produto (nome → funil). ROAS e CPA por funil são cruzamentos
// desses dois mapeamentos, não atribuição direta.

export interface Leitor {
  consultar<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export type PapelFunil = "entrada" | "etapa" | "backend" | "complemento";

export interface FunilCadastro {
  chave: string;
  rotulo: string;
  papel: PapelFunil;
  ordem: number;
}

export interface CampanhaLinha {
  metaCampaignId: string;
  nome: string;
  status: string;
  objetivo: string | null;
  funil: string | null; // SUGESTÃO automática pelo nome (SQL); o agrupamento manual vale por cima
  cidade: string | null;
  gastoTotal: number;
  ultimaData: string | null;
}

// Agrupamento manual salvo no app. Vale por cima da sugestão por nome (CampanhaLinha.funil).
export interface Atribuicao {
  metaCampaignId: string;
  funil: string | null; // chave do funil; null com foraDoEscopo = campanha ignorada
  foraDoEscopo: boolean;
}

export interface MetricaDia {
  dia: string;
  metaCampaignId: string;
  funil: string | null;
  cidade: string | null;
  gasto: number;
  impressoes: number;
  cliques: number;
}

export interface VendaLinha {
  dia: string;
  funil: string | null;
  produto: string;
  status: string;
  moeda: string;
  valor: number;
  comprador: string;
}

export interface ImpostoConfig {
  iss: number;
  pisCofins: number;
  modo: "soma_simples" | "cascata";
  vigenciaInicio: string;
  vigenciaFim: string | null;
  fonte: string;
}

export interface Frescor {
  ultimaMetrica: string | null;
  ultimaSincronizacaoMeta: string | null;
  ultimaVenda: string | null;
}

export interface DadosBrutos {
  funis: FunilCadastro[];
  atribuicoes: Atribuicao[];
  campanhas: CampanhaLinha[];
  metricas: MetricaDia[];
  vendas: VendaLinha[];
  imposto: ImpostoConfig[];
  frescor: Frescor;
}

export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

export function periodoValido(valor: string | undefined): Periodo {
  const n = Number(valor);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
}

const MS_DIA = 24 * 60 * 60 * 1000;

// "Hoje" no fuso de Recife (o mesmo dia de negócio do restante do sistema).
export function hojeEmRecife(agora = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Recife" }).format(agora);
}

export function intervalo(periodo: Periodo, hoje: string): { de: string; ate: string } {
  const fim = new Date(`${hoje}T00:00:00Z`);
  const ini = new Date(fim.getTime() - (periodo - 1) * MS_DIA);
  return { de: ini.toISOString().slice(0, 10), ate: hoje };
}

// Fator do imposto estimado da Meta vigente num dia. null = não configurado ou vencido:
// nesse caso o painel mostra só o gasto da API e diz que o custo com imposto não está configurado.
export function fatorImposto(configs: ImpostoConfig[], dia: string): number | null {
  const c = configs
    .filter((x) => x.vigenciaInicio <= dia && (!x.vigenciaFim || dia <= x.vigenciaFim))
    .sort((a, b) => (a.vigenciaInicio < b.vigenciaInicio ? 1 : -1))[0];
  if (!c) return null;
  return c.modo === "cascata" ? (1 + c.iss) * (1 + c.pisCofins) : 1 + c.iss + c.pisCofins;
}

export interface TotaisFunil {
  funil: string; // chave; "sem-funil" agrupa o que não foi classificado
  rotulo: string;
  papel: PapelFunil | "sem-funil";
  gasto: number; // gasto da API da Meta
  gastoComImposto: number | null; // estimativa; null se o imposto não está configurado
  impressoes: number;
  cliques: number;
  vendas: number; // aprovadas, BRL
  compradores: number; // compradores distintos com compra aprovada no período
  receita: number; // aprovadas em BRL
  reembolsado: number; // refunded + chargeback, BRL (já fora de `receita`)
  vendasOutraMoeda: number;
  ctr: number | null;
  cpm: number | null;
  cpa: number | null; // gasto com imposto (ou da API, se sem imposto) / vendas
  roas: number | null; // receita / gasto com imposto (ou da API, se sem imposto)
}

export interface PontoDia {
  dia: string;
  gasto: number;
  receita: number;
}

export interface EtapaPassagem {
  de: string;
  para: string;
  deRotulo: string;
  paraRotulo: string;
  base: number;
  passaram: number;
  taxa: number | null;
}

export type OrigemFunil = "manual" | "sugestao" | "nenhuma" | "fora";

export interface CampanhaResumo extends CampanhaLinha {
  funilEfetivo: string | null; // manual, senão a sugestão (se o funil existe)
  origemFunil: OrigemFunil;
  funilRotulo: string;
  gastoPeriodo: number;
  gastoPeriodoComImposto: number | null;
  impressoes: number;
  cliques: number;
  ctr: number | null;
  cpm: number | null;
}

export interface Dashboard {
  periodo: Periodo;
  de: string;
  ate: string;
  total: TotaisFunil;
  funis: TotaisFunil[];
  cidades: { cidade: string; gasto: number; gastoComImposto: number | null }[];
  serie: PontoDia[];
  etapas: EtapaPassagem[];
  campanhas: CampanhaResumo[];
  foraDoEscopo: { campanhas: number; gasto: number };
  qualidade: {
    campanhasSemFunil: CampanhaLinha[];
    produtosSemFunil: { produto: string; vendas: number; valor: number }[];
    impostoConfigurado: boolean;
  };
  frescor: Frescor;
}

const SEM_FUNIL = "sem-funil";

function razao(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function vazio(funil: string, rotulo: string, papel: TotaisFunil["papel"]): TotaisFunil {
  return {
    funil,
    rotulo,
    papel,
    gasto: 0,
    gastoComImposto: 0,
    impressoes: 0,
    cliques: 0,
    vendas: 0,
    compradores: 0,
    receita: 0,
    reembolsado: 0,
    vendasOutraMoeda: 0,
    ctr: null,
    cpm: null,
    cpa: null,
    roas: null,
  };
}

function fechar(t: TotaisFunil): TotaisFunil {
  const base = t.gastoComImposto ?? t.gasto;
  return {
    ...t,
    ctr: razao(t.cliques, t.impressoes) === null ? null : (t.cliques / t.impressoes) * 100,
    cpm: t.impressoes > 0 ? (t.gasto / t.impressoes) * 1000 : null,
    cpa: razao(base, t.vendas),
    roas: razao(t.receita, base),
  };
}

// Funis de entrada e etapas só têm CPA/ROAS com sentido quando há gasto atribuível;
// Mentoria e complemento não têm campanha própria, então ficam sem esses dois.
function semGastoProprio(t: TotaisFunil): TotaisFunil {
  return t.gasto > 0 ? t : { ...t, cpa: null, roas: null };
}

// Funil de uma campanha: o agrupamento manual vence; sem ele vale a sugestão pelo nome,
// desde que o funil exista no cadastro.
export function funilDaCampanha(
  metaCampaignId: string,
  sugestao: string | null,
  atribuicoes: Map<string, Atribuicao>,
  funisExistentes: Set<string>
): { funil: string | null; origem: OrigemFunil } {
  const a = atribuicoes.get(metaCampaignId);
  if (a) {
    if (a.foraDoEscopo) return { funil: null, origem: "fora" };
    if (a.funil && funisExistentes.has(a.funil)) return { funil: a.funil, origem: "manual" };
  }
  if (sugestao && funisExistentes.has(sugestao)) return { funil: sugestao, origem: "sugestao" };
  return { funil: null, origem: "nenhuma" };
}

export function montarDashboard(dados: DadosBrutos, periodo: Periodo, hoje: string): Dashboard {
  const { de, ate } = intervalo(periodo, hoje);
  const rotulos = new Map(dados.funis.map((f) => [f.chave, f]));
  const atribuicoes = new Map(dados.atribuicoes.map((a) => [a.metaCampaignId, a]));
  const existentes = new Set(dados.funis.map((f) => f.chave));
  const sugestaoDaCampanha = new Map(dados.campanhas.map((c) => [c.metaCampaignId, c.funil]));
  const efetivo = (id: string, sugestaoLinha: string | null) =>
    funilDaCampanha(id, sugestaoDaCampanha.get(id) ?? sugestaoLinha, atribuicoes, existentes);
  const fora = { campanhas: new Set<string>(), gasto: 0 };
  const noPeriodo = (dia: string) => dia >= de && dia <= ate;

  const porFunil = new Map<string, TotaisFunil>();
  const obter = (chave: string | null): TotaisFunil => {
    const k = chave && rotulos.has(chave) ? chave : SEM_FUNIL;
    let t = porFunil.get(k);
    if (!t) {
      const f = rotulos.get(k);
      t = vazio(k, f?.rotulo ?? "Sem funil", f?.papel ?? SEM_FUNIL);
      porFunil.set(k, t);
    }
    return t;
  };
  for (const f of dados.funis) obter(f.chave);

  const serie = new Map<string, PontoDia>();
  const ponto = (dia: string) => {
    let p = serie.get(dia);
    if (!p) serie.set(dia, (p = { dia, gasto: 0, receita: 0 }));
    return p;
  };
  const porCidade = new Map<string, { gasto: number; gastoComImposto: number | null }>();
  const gastoCampanha = new Map<string, { gasto: number; comImposto: number | null; imp: number; cli: number }>();
  let impostoOk = true;

  for (const m of dados.metricas) {
    if (!noPeriodo(m.dia)) continue;
    const ef = efetivo(m.metaCampaignId, m.funil);
    if (ef.origem === "fora") {
      fora.campanhas.add(m.metaCampaignId);
      fora.gasto += m.gasto;
      continue;
    }
    const fator = fatorImposto(dados.imposto, m.dia);
    if (fator === null) impostoOk = false;
    const t = obter(ef.funil);
    t.gasto += m.gasto;
    t.gastoComImposto = t.gastoComImposto === null || fator === null ? null : t.gastoComImposto + m.gasto * fator;
    t.impressoes += m.impressoes;
    t.cliques += m.cliques;
    ponto(m.dia).gasto += m.gasto;

    const c = gastoCampanha.get(m.metaCampaignId) ?? { gasto: 0, comImposto: 0, imp: 0, cli: 0 };
    c.gasto += m.gasto;
    c.comImposto = c.comImposto === null || fator === null ? null : c.comImposto + m.gasto * fator;
    c.imp += m.impressoes;
    c.cli += m.cliques;
    gastoCampanha.set(m.metaCampaignId, c);

    if (ef.funil === "presencial" && m.cidade) {
      const cd = porCidade.get(m.cidade) ?? { gasto: 0, gastoComImposto: 0 };
      cd.gasto += m.gasto;
      cd.gastoComImposto = cd.gastoComImposto === null || fator === null ? null : cd.gastoComImposto + m.gasto * fator;
      porCidade.set(m.cidade, cd);
    }
  }

  const compradoresPorFunil = new Map<string, Set<string>>();
  const semProduto = new Map<string, { vendas: number; valor: number }>();
  for (const v of dados.vendas) {
    if (!noPeriodo(v.dia)) continue;
    const t = obter(v.funil);
    const brl = v.moeda === "BRL";
    if (v.status === "approved") {
      if (!brl) {
        t.vendasOutraMoeda += 1;
        continue;
      }
      t.vendas += 1;
      t.receita += v.valor;
      ponto(v.dia).receita += v.valor;
      const set = compradoresPorFunil.get(t.funil) ?? new Set<string>();
      set.add(v.comprador);
      compradoresPorFunil.set(t.funil, set);
      if (t.funil === SEM_FUNIL) {
        const s = semProduto.get(v.produto) ?? { vendas: 0, valor: 0 };
        s.vendas += 1;
        s.valor += v.valor;
        semProduto.set(v.produto, s);
      }
    } else if ((v.status === "refunded" || v.status === "chargeback") && brl) {
      t.reembolsado += v.valor;
    }
  }
  for (const [k, set] of compradoresPorFunil) {
    const t = porFunil.get(k);
    if (t) t.compradores = set.size;
  }

  const ordem = (t: TotaisFunil) => rotulos.get(t.funil)?.ordem ?? 999;
  const funis = [...porFunil.values()]
    .map(fechar)
    .map(semGastoProprio)
    .filter((t) => t.funil !== SEM_FUNIL || t.gasto > 0 || t.vendas > 0)
    .sort((a, b) => ordem(a) - ordem(b));

  const soma = funis.reduce((acc, t) => {
    acc.gasto += t.gasto;
    acc.gastoComImposto = acc.gastoComImposto === null || t.gastoComImposto === null ? null : acc.gastoComImposto + t.gastoComImposto;
    acc.impressoes += t.impressoes;
    acc.cliques += t.cliques;
    acc.vendas += t.vendas;
    acc.receita += t.receita;
    acc.reembolsado += t.reembolsado;
    acc.vendasOutraMoeda += t.vendasOutraMoeda;
    return acc;
  }, vazio("total", "Total", "entrada"));
  const compradoresTotal = new Set<string>();
  for (const set of compradoresPorFunil.values()) for (const c of set) compradoresTotal.add(c);
  soma.compradores = compradoresTotal.size;
  const total = fechar(soma);

  // Passagem entre etapas: Desafio → Grupo VIP → Mentoria, por comprador (hash) com compra
  // aprovada no período. "Quer avançar para a Mentoria" ainda não existe na fonte.
  const sequencia: [string, string][] = [
    ["desafio", "grupo_vip"],
    ["grupo_vip", "mentoria"],
    ["desafio", "mentoria"],
  ];
  const etapas: EtapaPassagem[] = sequencia.map(([a, b]) => {
    const base = compradoresPorFunil.get(a) ?? new Set<string>();
    const alvo = compradoresPorFunil.get(b) ?? new Set<string>();
    let passaram = 0;
    for (const c of base) if (alvo.has(c)) passaram += 1;
    return {
      de: a,
      para: b,
      deRotulo: rotulos.get(a)?.rotulo ?? a,
      paraRotulo: rotulos.get(b)?.rotulo ?? b,
      base: base.size,
      passaram,
      taxa: razao(passaram, base.size),
    };
  });

  const campanhas: CampanhaResumo[] = dados.campanhas
    .map((c) => {
      const g = gastoCampanha.get(c.metaCampaignId);
      const ef = efetivo(c.metaCampaignId, c.funil);
      return {
        ...c,
        funilEfetivo: ef.funil,
        origemFunil: ef.origem,
        funilRotulo: ef.origem === "fora" ? "Fora do escopo" : (ef.funil && rotulos.get(ef.funil)?.rotulo) || "Sem funil",
        gastoPeriodo: g?.gasto ?? 0,
        gastoPeriodoComImposto: g ? g.comImposto : 0,
        impressoes: g?.imp ?? 0,
        cliques: g?.cli ?? 0,
        ctr: g && g.imp > 0 ? (g.cli / g.imp) * 100 : null,
        cpm: g && g.imp > 0 ? (g.gasto / g.imp) * 1000 : null,
      };
    })
    .sort((a, b) => b.gastoPeriodo - a.gastoPeriodo);

  return {
    periodo,
    de,
    ate,
    total,
    funis,
    cidades: [...porCidade.entries()]
      .map(([cidade, v]) => ({ cidade, ...v }))
      .sort((a, b) => b.gasto - a.gasto),
    serie: [...serie.values()].sort((a, b) => (a.dia < b.dia ? -1 : 1)),
    etapas,
    campanhas,
    foraDoEscopo: { campanhas: fora.campanhas.size, gasto: fora.gasto },
    qualidade: {
      campanhasSemFunil: campanhas.filter((c) => c.origemFunil === "nenhuma"),
      produtosSemFunil: [...semProduto.entries()]
        .map(([produto, v]) => ({ produto, ...v }))
        .sort((a, b) => b.vendas - a.vendas),
      impostoConfigurado: impostoOk && dados.imposto.length > 0,
    },
    frescor: dados.frescor,
  };
}

// --- Leitura das views --------------------------------------------------------

interface LinhaCampanha {
  meta_campaign_id: string; nome: string; status: string; objetivo: string | null;
  funil: string | null; cidade: string | null; gasto_total: string | number | null; ultima_data: string | Date | null;
}
interface LinhaMetrica {
  dia: string | Date; meta_campaign_id: string; funil: string | null; cidade: string | null;
  gasto: string | number | null; impressoes: string | number | null; cliques: string | number | null;
}
interface LinhaVenda {
  dia: string | Date; funil: string | null; produto: string; status: string; moeda: string;
  valor: string | number | null; comprador: string;
}
interface LinhaImposto {
  iss: string | number; pis_cofins: string | number; modo: "soma_simples" | "cascata";
  vigencia_inicio: string | Date; vigencia_fim: string | Date | null; fonte: string;
}
interface LinhaFrescor {
  ultima_metrica: string | Date | null; ultima_sincronizacao_meta: string | Date | null; ultima_venda: string | Date | null;
}

const num = (v: string | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));
const dia = (v: string | Date): string => (typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));
const dataOuNulo = (v: string | Date | null): string | null => (v === null ? null : typeof v === "string" ? v : v.toISOString());

// Funis e agrupamento manual vêm do banco da gestão (`cadastro`); o resto, do Dashboard-italo.
export async function lerDados(
  leitor: Leitor,
  periodo: Periodo,
  hoje: string,
  cadastro: { funis: FunilCadastro[]; atribuicoes: Atribuicao[] }
): Promise<DadosBrutos> {
  const { de } = intervalo(periodo, hoje);
  const [campanhas, metricas, vendas, imposto, frescor] = await Promise.all([
    leitor.consultar<LinhaCampanha>(
      "select meta_campaign_id, nome, status, objetivo, funil, cidade, gasto_total, ultima_data from v_gestao_campanhas"
    ),
    leitor.consultar<LinhaMetrica>(
      "select dia, meta_campaign_id, funil, cidade, gasto, impressoes, cliques from v_gestao_funil_dia where dia >= $1 and dia <= $2",
      [de, hoje]
    ),
    leitor.consultar<LinhaVenda>(
      "select dia, funil, produto, status, moeda, valor, comprador from v_gestao_vendas where dia >= $1 and dia <= $2",
      [de, hoje]
    ),
    leitor.consultar<LinhaImposto>("select iss, pis_cofins, modo, vigencia_inicio, vigencia_fim, fonte from v_gestao_imposto"),
    leitor.consultar<LinhaFrescor>("select ultima_metrica, ultima_sincronizacao_meta, ultima_venda from v_gestao_frescor"),
  ]);

  return {
    funis: cadastro.funis,
    atribuicoes: cadastro.atribuicoes,
    campanhas: campanhas.map((c) => ({
      metaCampaignId: c.meta_campaign_id,
      nome: c.nome,
      status: c.status,
      objetivo: c.objetivo,
      funil: c.funil,
      cidade: c.cidade,
      gastoTotal: num(c.gasto_total),
      ultimaData: c.ultima_data ? dia(c.ultima_data) : null,
    })),
    metricas: metricas.map((m) => ({
      dia: dia(m.dia),
      metaCampaignId: m.meta_campaign_id,
      funil: m.funil,
      cidade: m.cidade,
      gasto: num(m.gasto),
      impressoes: num(m.impressoes),
      cliques: num(m.cliques),
    })),
    vendas: vendas.map((v) => ({
      dia: dia(v.dia),
      funil: v.funil,
      produto: v.produto,
      status: v.status,
      moeda: v.moeda,
      valor: num(v.valor),
      comprador: v.comprador,
    })),
    imposto: imposto.map((i) => ({
      iss: num(i.iss),
      pisCofins: num(i.pis_cofins),
      modo: i.modo,
      vigenciaInicio: dia(i.vigencia_inicio),
      vigenciaFim: i.vigencia_fim ? dia(i.vigencia_fim) : null,
      fonte: i.fonte,
    })),
    frescor: frescor[0]
      ? {
          ultimaMetrica: frescor[0].ultima_metrica ? dia(frescor[0].ultima_metrica) : null,
          ultimaSincronizacaoMeta: dataOuNulo(frescor[0].ultima_sincronizacao_meta),
          ultimaVenda: dataOuNulo(frescor[0].ultima_venda),
        }
      : { ultimaMetrica: null, ultimaSincronizacaoMeta: null, ultimaVenda: null },
  };
}
