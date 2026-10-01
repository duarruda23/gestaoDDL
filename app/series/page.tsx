import Link from "next/link";
import { desc, inArray, sql } from "drizzle-orm";
import { obterBanco } from "@/db";
import { seriesRecorrentes, tarefas } from "@/db/schema";
import { exigirConta } from "@/lib/servidor/dal";
import { TituloPagina } from "@/components/ui";

export const metadata = { title: "Séries · Gestão Donas de Loja" };

export default async function PaginaSeries() {
  await exigirConta();
  const banco = obterBanco();
  const [series, contagens] = await Promise.all([banco.select({
    id: seriesRecorrentes.id, titulo: seriesRecorrentes.titulo,
    frequencia: seriesRecorrentes.frequencia, estado: seriesRecorrentes.estado,
    inicioEm: seriesRecorrentes.inicioEm, requerAtencao: seriesRecorrentes.requerAtencao,
  }).from(seriesRecorrentes).orderBy(desc(seriesRecorrentes.criadaEm)),
  banco.select({ serieId: tarefas.serieRecorrenteId, total: sql<number>`count(*)::int` }).from(tarefas)
    .where(inArray(tarefas.estado, ["triagem", "a_fazer", "em_andamento", "em_revisao", "bloqueada"]))
    .groupBy(tarefas.serieRecorrenteId)]);
  const abertas = new Map(contagens.map((c) => [c.serieId, c.total]));
  return (
    <div className="max-w-3xl">
      <TituloPagina chapeu="Séries" titulo="Tarefas recorrentes" subtitulo="Cada data programada terá uma tarefa independente quando chegar o dia." />
      <Link href="/nova" className="dl-link mb-5 inline-block">Criar série em Pedir</Link>
      {series.length === 0 ? <p className="dl-panel p-5 text-sm">Nenhuma série criada.</p> : (
        <ul className="flex flex-col gap-3">
          {series.map((s) => <li key={s.id}>
            <Link href={`/series/${s.id}`} className="dl-card block">
              <span className="block font-semibold">{s.titulo}</span>
              <span className="text-sm text-ink-muted">{s.frequencia} · {s.estado} · desde {s.inicioEm.split("-").reverse().join("/")}</span>
              {s.requerAtencao ? <span className="mt-1 block text-sm font-semibold text-danger">Precisa de atenção: limite de tarefas abertas.</span>
                : (abertas.get(s.id) ?? 0) >= 2 ? <span className="mt-1 block text-sm font-semibold text-warning">Há {abertas.get(s.id)} tarefas abertas nesta série.</span> : null}
            </Link>
          </li>)}
        </ul>
      )}
    </div>
  );
}
