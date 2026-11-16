import Link from "next/link";
import { dashboardItaloConfigurado, obterLeitorDashboardItalo } from "@/db/dashboard-italo";
import { obterBanco } from "@/db";
import { exigirGestor } from "@/lib/servidor/dal";
import { listarAtribuicoes, listarFunis } from "@/lib/servidor/campanhas-funis-nucleo";
import {
  PERIODOS,
  hojeEmRecife,
  lerDados,
  montarDashboard,
  periodoValido,
  type Dashboard,
  type TotaisFunil,
} from "@/lib/servidor/campanhas-nucleo";
import { dataCurta, dataHora, dinheiro, percentual, quantidade, razaoTexto } from "@/lib/campanhas-formato";
import { GraficoDiario } from "@/components/campanhas/GraficoDiario";
import { AgruparCampanhas } from "@/components/campanhas/AgruparCampanhas";
import { TituloPagina, TituloSecao, Vazio } from "@/components/ui";

export const metadata = { title: "Campanhas · Gestão Donas de Loja" };
export const dynamic = "force-dynamic";

const ABAS = [
  { valor: "geral", rotulo: "Visão geral" },
  { valor: "funis", rotulo: "Por funil" },
  { valor: "campanhas", rotulo: "Campanhas" },
  { valor: "agrupar", rotulo: "Agrupar" },
  { valor: "qualidade", rotulo: "Qualidade" },
] as const;
type Aba = (typeof ABAS)[number]["valor"];

function abaValida(v: string | undefined): Aba {
  return ABAS.some((a) => a.valor === v) ? (v as Aba) : "geral";
}

function href(aba: Aba, periodo: number, funil?: string): string {
  const q = new URLSearchParams({ aba, periodo: String(periodo) });
  if (funil) q.set("funil", funil);
  return `/campanhas?${q.toString()}`;
}

function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="dl-stat dl-stat-zero">
      <p className="dl-stat-value !text-[22px] sm:!text-[26px]">{valor}</p>
      <p className="dl-stat-label">{rotulo}</p>
      {nota && <p className="mt-1 text-[11px] leading-4 text-ink-subtle">{nota}</p>}
    </div>
  );
}

function Escolha({ itens }: { itens: { rotulo: string; ativo: boolean; url: string }[] }) {
  return (
    <div className="dl-seg" role="group">
      {itens.map((i) => (
        <Link key={i.url} href={i.url} className="dl-seg-opt" aria-current={i.ativo ? "true" : undefined}>
          {i.rotulo}
        </Link>
      ))}
    </div>
  );
}

function custoNota(d: Dashboard): string {
  return d.qualidade.impostoConfigurado
    ? "Estimativa: gasto da API × (1 + ISS + PIS/COFINS). Não é a fatura da Meta."
    : "Imposto não configurado ou vencido: mostrando só o gasto da API.";
}

function LinhaFunil({ t, dest }: { t: TotaisFunil; dest?: boolean }) {
  const gastoMostrado = t.gastoComImposto ?? t.gasto;
  return (
    <tr className={dest ? "font-bold" : undefined}>
      <td className="p-3 font-bold">{t.rotulo}</td>
      <td className="p-3 text-right tabular-nums">{t.gasto > 0 ? dinheiro(gastoMostrado) : "—"}</td>
      <td className="p-3 text-right tabular-nums">{t.vendas ? quantidade(t.vendas) : "—"}</td>
      <td className="p-3 text-right tabular-nums">{t.receita > 0 ? dinheiro(t.receita) : "—"}</td>
      <td className="p-3 text-right tabular-nums">{razaoTexto(t.roas)}</td>
      <td className="p-3 text-right tabular-nums">{dinheiro(t.cpa)}</td>
      <td className="p-3 text-right tabular-nums">{percentual(t.ctr)}</td>
    </tr>
  );
}

function CabecalhoFunis() {
  return (
    <thead>
      <tr className="text-left text-xs text-ink-muted">
        <th className="p-3 font-semibold">Funil</th>
        <th className="p-3 font-semibold text-right">Gasto</th>
        <th className="p-3 font-semibold text-right">Vendas</th>
        <th className="p-3 font-semibold text-right">Receita</th>
        <th className="p-3 font-semibold text-right">ROAS</th>
        <th className="p-3 font-semibold text-right">CPA</th>
        <th className="p-3 font-semibold text-right">CTR</th>
      </tr>
    </thead>
  );
}

function Geral({ d }: { d: Dashboard }) {
  const t = d.total;
  const gasto = t.gastoComImposto ?? t.gasto;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi rotulo={t.gastoComImposto !== null ? "Gasto com imposto (estim.)" : "Gasto (API)"} valor={dinheiro(gasto)} nota={t.gastoComImposto !== null ? `API: ${dinheiro(t.gasto)}` : undefined} />
        <Kpi rotulo="Vendas aprovadas" valor={quantidade(t.vendas)} />
        <Kpi rotulo="Receita Hotmart" valor={dinheiro(t.receita)} nota={t.reembolsado > 0 ? `Reembolsos/chargebacks: ${dinheiro(t.reembolsado)}` : undefined} />
        <Kpi rotulo="ROAS" valor={razaoTexto(t.roas)} />
        <Kpi rotulo="CPA" valor={dinheiro(t.cpa)} />
        <Kpi rotulo="CTR · CPM" valor={`${percentual(t.ctr)} · ${dinheiro(t.cpm)}`} />
      </section>
      <p className="text-xs text-ink-subtle">{custoNota(d)} Receita e gasto são ligados por produto e por tag da campanha, não por venda.</p>
      <section>
        <TituloSecao>Gasto e receita por dia</TituloSecao>
        {d.serie.length ? <GraficoDiario serie={d.serie} /> : <Vazio>Sem dados neste período.</Vazio>}
      </section>
      {d.cidades.length > 0 && (
        <section>
          <TituloSecao>Presencial por cidade (gasto)</TituloSecao>
          <div className="dl-panel !p-0 overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <tbody className="divide-y divide-line">
                {d.cidades.map((c) => (
                  <tr key={c.cidade}>
                    <td className="p-3 font-bold">{c.cidade}</td>
                    <td className="p-3 text-right tabular-nums">{dinheiro(c.gastoComImposto ?? c.gasto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function PorFunil({ d }: { d: Dashboard }) {
  const entradas = d.funis.filter((f) => f.papel === "entrada" || f.papel === "sem-funil");
  const etapa = d.funis.filter((f) => f.papel === "etapa");
  const backend = d.funis.filter((f) => f.papel === "backend");
  const complemento = d.funis.filter((f) => f.papel === "complemento");
  const bloco = (titulo: string, itens: TotaisFunil[], nota?: string) => (
    <section>
      <TituloSecao>{titulo}</TituloSecao>
      {nota && <p className="mb-2 text-xs text-ink-subtle">{nota}</p>}
      <div className="dl-panel !p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <CabecalhoFunis />
          <tbody className="divide-y divide-line">
            {itens.map((t) => (
              <LinhaFunil key={t.funil} t={t} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <>
      {bloco("Funis de entrada", entradas, custoNota(d))}
      <section>
        <TituloSecao>Do Desafio à Mentoria</TituloSecao>
        <p className="mb-2 text-xs text-ink-subtle">
          Compradores com compra aprovada no período, contados por pessoa. A etapa &ldquo;quer avançar para a Mentoria&rdquo; ainda não tem registro na fonte.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {d.etapas.map((e) => (
            <div key={`${e.de}-${e.para}`} className="dl-panel">
              <p className="text-xs text-ink-muted">
                {e.deRotulo} → {e.paraRotulo}
              </p>
              <p className="mt-1 text-[22px] font-extrabold tabular-nums">{percentual(e.taxa === null ? null : e.taxa * 100)}</p>
              <p className="text-xs text-ink-subtle">
                {quantidade(e.passaram)} de {quantidade(e.base)}
              </p>
            </div>
          ))}
        </div>
      </section>
      {etapa.length > 0 && bloco("Etapa intermediária", etapa)}
      {backend.length > 0 && bloco("Mentoria (final do funil)", backend, "A Mentoria não tem campanha própria nem origem registrada; a receita não é dividida entre os funis de entrada.")}
      {complemento.length > 0 && bloco("Complemento", complemento, "A Análise de Perfil pode ser comprada junto com o Desafio ou com a Mentoria.")}
      {d.total.vendasOutraMoeda > 0 && (
        <p className="text-xs text-ink-subtle">{quantidade(d.total.vendasOutraMoeda)} vendas em outra moeda ficaram fora dos totais em reais.</p>
      )}
    </>
  );
}

function Campanhas({ d, funil }: { d: Dashboard; funil?: string }) {
  const lista = funil ? d.campanhas.filter((c) => (funil === "sem-funil" ? c.origemFunil === "nenhuma" : c.funilEfetivo === funil)) : d.campanhas;
  const filtros = [
    { rotulo: "Todos", ativo: !funil, url: href("campanhas", d.periodo) },
    ...d.funis
      .filter((f) => f.papel === "entrada" || f.papel === "sem-funil")
      .map((f) => ({ rotulo: f.rotulo, ativo: funil === f.funil, url: href("campanhas", d.periodo, f.funil) })),
  ];
  return (
    <>
      <div className="overflow-x-auto pb-1">
        <Escolha itens={filtros} />
      </div>
      <div className="dl-panel !p-0 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="p-3 font-semibold">Campanha</th>
              <th className="p-3 font-semibold">Funil</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 font-semibold text-right">Gasto</th>
              <th className="p-3 font-semibold text-right">CTR</th>
              <th className="p-3 font-semibold text-right">CPM</th>
              <th className="p-3 font-semibold text-right">Último dado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lista.map((c) => (
              <tr key={c.metaCampaignId}>
                <td className="p-3 font-bold break-words max-w-[360px]">{c.nome}</td>
                <td className="p-3">{c.funilRotulo}</td>
                <td className="p-3">{c.status === "active" ? "Ativa" : c.status === "paused" ? "Pausada" : c.status}</td>
                <td className="p-3 text-right tabular-nums">{c.gastoPeriodo > 0 ? dinheiro(c.gastoPeriodoComImposto ?? c.gastoPeriodo) : "—"}</td>
                <td className="p-3 text-right tabular-nums">{percentual(c.ctr)}</td>
                <td className="p-3 text-right tabular-nums">{dinheiro(c.cpm)}</td>
                <td className="p-3 text-right tabular-nums">{dataCurta(c.ultimaData)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lista.length && <Vazio>Nenhuma campanha neste filtro.</Vazio>}
      </div>
    </>
  );
}

function Qualidade({ d }: { d: Dashboard }) {
  const q = d.qualidade;
  return (
    <>
      <section>
        <TituloSecao>Frescor dos dados</TituloSecao>
        <div className="dl-panel text-sm">
          <p>Meta: última métrica em <strong>{dataCurta(d.frescor.ultimaMetrica)}</strong>, sincronizada em <strong>{dataHora(d.frescor.ultimaSincronizacaoMeta)}</strong>.</p>
          <p className="mt-1">Hotmart: última venda em <strong>{dataHora(d.frescor.ultimaVenda)}</strong>.</p>
          <p className="mt-1 text-ink-muted">A Meta revisa o gasto dos últimos dias; trate o dia de hoje como parcial.</p>
        </div>
      </section>
      <section>
        <TituloSecao tom={q.campanhasSemFunil.length ? "danger" : undefined}>Campanhas sem funil ({q.campanhasSemFunil.length})</TituloSecao>
        {q.campanhasSemFunil.length ? (
          <div className="dl-panel !p-0 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <tbody className="divide-y divide-line">
                {q.campanhasSemFunil.map((c) => (
                  <tr key={c.metaCampaignId}>
                    <td className="p-3 font-bold break-words">{c.nome}</td>
                    <td className="p-3 text-right tabular-nums">{dinheiro(c.gastoTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio>Toda campanha tem funil.</Vazio>
        )}
        <p className="mt-2 text-xs text-ink-subtle">Para classificar, use a aba <Link href={href("agrupar", d.periodo)} className="underline">Agrupar</Link>.</p>
      </section>
      <section>
        <TituloSecao tom={q.produtosSemFunil.length ? "danger" : undefined}>Produtos vendidos sem funil ({q.produtosSemFunil.length})</TituloSecao>
        {q.produtosSemFunil.length ? (
          <div className="dl-panel !p-0 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <tbody className="divide-y divide-line">
                {q.produtosSemFunil.map((p) => (
                  <tr key={p.produto}>
                    <td className="p-3 font-bold break-words">{p.produto}</td>
                    <td className="p-3 text-right tabular-nums">{quantidade(p.vendas)}</td>
                    <td className="p-3 text-right tabular-nums">{dinheiro(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio>Todo produto vendido no período tem funil.</Vazio>
        )}
        <p className="mt-2 text-xs text-ink-subtle">Para classificar, inclua uma regra em <code>mapa_produto_funil</code>.</p>
      </section>
      <section>
        <TituloSecao>Imposto estimado da Meta</TituloSecao>
        <div className="dl-panel text-sm">
          {q.impostoConfigurado ? (
            <p>Configurado em <code>config_imposto_meta</code> (ISS + PIS/COFINS), como estimativa. Ainda não conferido em fatura real da Meta.</p>
          ) : (
            <p>Sem configuração vigente para parte do período. Os custos aparecem só com o gasto da API.</p>
          )}
        </div>
      </section>
    </>
  );
}

export default async function PaginaCampanhas({ searchParams }: PageProps<"/campanhas">) {
  await exigirGestor();
  const sp = await searchParams;
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const aba = abaValida(um(sp.aba));
  const periodo = periodoValido(um(sp.periodo));
  const funil = um(sp.funil);

  let d: Dashboard | null = null;
  let erro: string | null = null;
  if (!dashboardItaloConfigurado()) {
    erro = "A conexão com o Dashboard-italo ainda não foi configurada (DASHBOARD_ITALO_DATABASE_URL).";
  } else {
    try {
      const hoje = hojeEmRecife();
      const banco = obterBanco();
      const [funis, atribuicoes] = await Promise.all([listarFunis(banco), listarAtribuicoes(banco)]);
      d = montarDashboard(await lerDados(obterLeitorDashboardItalo(), periodo, hoje, { funis, atribuicoes }), periodo, hoje);
    } catch (e) {
      console.error("campanhas: falha ao ler o Dashboard-italo", e instanceof Error ? e.message : e);
      erro = "Não consegui ler os dados do Dashboard-italo agora. Tente de novo em instantes.";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        chapeu="Campanhas"
        titulo="Campanhas por funil"
        subtitulo={d ? `Dados de ${dataCurta(d.de)} a ${dataCurta(d.ate)}. Meta atualizada em ${dataHora(d.frescor.ultimaSincronizacaoMeta)}.` : "Meta Ads e Hotmart, separados por funil."}
      />
      {erro && <div className="dl-panel text-sm text-danger" role="alert">{erro}</div>}
      {d && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="overflow-x-auto">
              <Escolha itens={ABAS.map((a) => ({ rotulo: a.rotulo, ativo: a.valor === aba, url: href(a.valor, periodo) }))} />
            </div>
            <Escolha itens={PERIODOS.map((p) => ({ rotulo: `${p} dias`, ativo: p === periodo, url: href(aba, p, funil) }))} />
          </div>
          {aba === "geral" && <Geral d={d} />}
          {aba === "funis" && <PorFunil d={d} />}
          {aba === "campanhas" && <Campanhas d={d} funil={funil} />}
          {aba === "agrupar" && (
            <AgruparCampanhas
              funis={d.funis.filter((f) => f.funil !== "sem-funil").map((f) => ({ chave: f.funil, rotulo: f.rotulo }))}
              campanhas={d.campanhas.map((c) => ({
                id: c.metaCampaignId,
                nome: c.nome,
                status: c.status,
                gasto: c.gastoPeriodoComImposto ?? c.gastoPeriodo,
                funilRotulo: c.funilRotulo,
                origem: c.origemFunil,
              }))}
            />
          )}
          {aba === "qualidade" && <Qualidade d={d} />}
        </>
      )}
    </div>
  );
}
