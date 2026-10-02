import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { obterBanco } from "@/db";
import { eventosSerie, seriesRecorrentes, tarefas, usuarios } from "@/db/schema";
import { exigirConta } from "@/lib/servidor/dal";
import { carregarEquipe } from "@/lib/servidor/pedidos-nucleo";
import { FormSerie } from "@/components/series/FormSerie";
import { TituloPagina } from "@/components/ui";
import { hojeISO, formatarDataHora } from "@/lib/datas";
import type { RegraRecorrencia } from "@/lib/recorrencia/calendario";

export const metadata = { title: "Série · Gestão Donas de Loja" };

export default async function PaginaSerie({ params }: PageProps<"/series/[id]">) {
  await exigirConta();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const banco = obterBanco();
  const [[serie], equipe, ocorrencias, eventos, pessoas] = await Promise.all([
    banco.select().from(seriesRecorrentes).where(eq(seriesRecorrentes.id, id)).limit(1),
    carregarEquipe(banco),
    banco.select({ id: tarefas.id, titulo: tarefas.titulo, estado: tarefas.estado, prazo: tarefas.prazo, responsavelId: tarefas.responsavelId })
      .from(tarefas).where(eq(tarefas.serieRecorrenteId, id)).orderBy(asc(tarefas.dataProgramadaLocal)),
    banco.select().from(eventosSerie).where(eq(eventosSerie.serieId, id)).orderBy(asc(eventosSerie.criadoEm)),
    banco.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios),
  ]);
  if (!serie) notFound();
  const nomes = new Map(pessoas.map((p) => [p.id, p.nome]));
  const abertas = ocorrencias.filter((t) => !["concluida", "arquivada"].includes(t.estado)).length;
  const base = { inicioEm: serie.inicioEm, fimEm: serie.fimEm, intervalo: serie.intervalo };
  const regra: RegraRecorrencia = serie.frequencia === "diaria" ? { ...base, frequencia: "diaria" }
    : serie.frequencia === "semanal" || serie.frequencia === "personalizada" ? { ...base, frequencia: serie.frequencia, diasSemana: serie.diasSemana ?? [] }
      : serie.frequencia === "mensal" ? { ...base, frequencia: "mensal", ...(serie.ultimoDiaMes ? { ultimoDiaMes: true } : { diaMes: serie.diaMes ?? undefined }) }
        : { ...base, frequencia: "anual", mesAno: serie.mesAno!, diaAno: serie.diaAno! };
  return (
    <div className="max-w-3xl">
      <Link href="/series" className="dl-link mb-3 inline-block">Voltar às séries</Link>
      <TituloPagina chapeu="Série recorrente" titulo={serie.titulo} subtitulo={`Estado: ${serie.estado}. Criada por ${nomes.get(serie.criadoPorId) ?? "conta antiga"}.`} />
      {serie.requerAtencao ? <p className="mb-4 text-sm font-semibold text-danger" role="status">A série precisa de atenção. Resolva uma tarefa atrasada ou escolha um responsável ativo.</p>
        : abertas >= 2 ? <p className="mb-4 text-sm font-semibold text-warning" role="status">Há {abertas} tarefas abertas nesta série.</p> : null}
      <FormSerie
        pessoas={equipe.pessoas.map(({ id, nome }) => ({ id, nome }))}
        frentes={equipe.frentes.map(({ id, nome }) => ({ id, nome }))}
        hoje={hojeISO()}
        inicial={{
          id: serie.id, versao: serie.versao, estado: serie.estado, titulo: serie.titulo,
          descricao: serie.descricao, frenteId: serie.frenteId, responsavelId: serie.responsavelId,
          prioridade: serie.prioridade, horaVencimento: serie.horaVencimento, regra,
        }}
      />
      <section className="dl-panel mt-6 !p-5">
        <h2 className="mb-3 text-lg font-semibold">Ocorrências criadas</h2>
        {ocorrencias.length ? <ul className="flex flex-col gap-2">{ocorrencias.map((t) =>
          <li key={t.id} className="text-sm"><Link className="dl-link" href={`/tarefa/${t.id}`}>{t.titulo}</Link> · {t.prazo} · {t.estado} · {nomes.get(t.responsavelId ?? "") ?? "sem responsável"}</li>
        )}</ul> : <p className="text-sm text-ink-muted">Nenhuma ocorrência criada. As próximas datas acima são apenas prévia.</p>}
      </section>
      <section className="dl-panel mt-6 !p-5">
        <h2 className="mb-3 text-lg font-semibold">Histórico da série</h2>
        <ol className="flex flex-col gap-2">{eventos.map((e) =>
          <li key={e.id} className="text-sm">{formatarDataHora(e.criadoEm.toISOString())} · {nomes.get(e.atorId) ?? "conta antiga"} · {e.tipo}</li>
        )}</ol>
      </section>
    </div>
  );
}
