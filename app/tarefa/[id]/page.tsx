import Link from "next/link";
import { notFound } from "next/navigation";
import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { detalharTarefa, listarPessoasEFrentes } from "@/lib/servidor/consultas";
import { ROTULO_ESTADO, ROTULO_REGRA } from "@/lib/regras";
import { formatarData, formatarDataHora } from "@/lib/datas";
import type { RegraCobranca } from "@/lib/types";
import { AcoesTarefa } from "@/components/tarefa/AcoesTarefa";
import { ChecklistEditavel } from "@/components/tarefa/ChecklistEditavel";
import { Comentar } from "@/components/tarefa/Comentar";
import { Aviso, EtiquetaEstado, EtiquetaIA, EtiquetaPrazo, EtiquetaPrioridade, TituloSecao, Vazio } from "@/components/ui";

const ROTULO_EVENTO: Record<string, string> = {
  criada: "Pediu",
  confirmada_ia: "Confirmou o pedido da IA",
  estado: "Mudou a etapa",
  responsavel: "Mudou o responsável",
  prazo: "Mudou o prazo",
  prioridade: "Mudou a prioridade",
  comentario: "Comentou",
  checklist: "Mexeu no checklist",
  cobranca: "Cobrou",
  acesso: "Acesso",
};

const ROTULO_ENVIO: Record<string, string> = {
  pendente: "na fila",
  enviando: "enviando",
  enviado: "enviada",
  falhou: "falhou",
  ignorado: "ignorada",
};

// Etapa é gravada como "estado" ou "estado — detalhe" (motivo do bloqueio,
// desfez o arquivamento); mostra o nome da etapa e mantém o detalhe.
function rotuloEtapa(v: string): string {
  const [etapa, ...resto] = v.split(" — ");
  const nome = etapa in ROTULO_ESTADO ? ROTULO_ESTADO[etapa as keyof typeof ROTULO_ESTADO] : etapa;
  return resto.length ? `${nome} (${resto.join(" — ")})` : nome;
}

function descreverMudanca(tipo: string, antes: string | null, depois: string | null): string | null {
  const rotulo = (v: string | null) =>
    v == null ? "—" : tipo === "estado" ? rotuloEtapa(v) : tipo === "prazo" ? formatarData(v) : v;
  if (antes == null && depois == null) return null;
  if (antes == null) return rotulo(depois);
  return `${rotulo(antes)} → ${rotulo(depois)}`;
}

// Detalhe da tarefa. Modelo horizontal: qualquer conta muda etapa, edita,
// comenta e mexe no checklist. Cobrar entra na A8.
export default async function DetalheTarefa({ params }: PageProps<"/tarefa/[id]">) {
  await exigirConta();
  const { id } = await params;
  const banco = obterBanco();
  const [t, { pessoas, frentes }] = await Promise.all([detalharTarefa(banco, id), listarPessoasEFrentes(banco)]);
  if (!t) notFound();
  const arquivada = t.estado === "arquivada";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/quadro" className="text-sm font-semibold text-ink-muted hover:text-ink">
          ← Quadro
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <EtiquetaEstado estado={t.estado} />
          <EtiquetaPrioridade prioridade={t.prioridade} />
          {t.origem === "ia" && <EtiquetaIA />}
        </div>
        <h1 className="dl-heading">{t.titulo}</h1>
        {t.descricao && <p className="max-w-2xl whitespace-pre-wrap text-ink-muted">{t.descricao}</p>}
      </header>

      <AcoesTarefa key={t.versao} tarefa={t} pessoas={pessoas} frentes={frentes} />

      {t.estado === "bloqueada" && t.motivoBloqueio && (
        <Aviso tom="warning" titulo="Bloqueada">
          {t.motivoBloqueio}
        </Aviso>
      )}

      <dl className="dl-panel grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs text-ink-muted">Quem faz</dt>
          <dd className="font-bold">{t.responsavel?.nome ?? "Ninguém ainda"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Quem pediu</dt>
          <dd className="font-bold">{t.criador.nome}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Prazo</dt>
          <dd className="font-bold">
            <EtiquetaPrazo tarefa={t} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Frente</dt>
          <dd className="font-bold">{t.frente?.nome ?? "Sem frente"}</dd>
        </div>
        {t.envolvidos.length > 0 && (
          <div className="col-span-2 md:col-span-4">
            <dt className="text-xs text-ink-muted">Envolvidos</dt>
            <dd className="font-bold">{t.envolvidos.map((p) => p.nome).join(", ")}</dd>
          </div>
        )}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <section>
            <TituloSecao>
              Checklist {t.checklistTotal > 0 && <span className="text-ink-muted">({t.checklistFeitos}/{t.checklistTotal})</span>}
            </TituloSecao>
            <ChecklistEditavel tarefaId={t.id} itens={t.checklist} arquivada={arquivada} />
          </section>

          <section className="flex flex-col gap-3">
            <TituloSecao>Comentários</TituloSecao>
            {t.comentarios.length ? (
              <ul className="flex flex-col gap-3">
                {t.comentarios.map((c) => (
                  <li key={c.id} className="dl-panel text-sm">
                    <p className="mb-1 text-xs text-ink-muted">
                      <span className="font-bold text-ink">{c.autor}</span> · {formatarDataHora(c.criadoEm)}
                    </p>
                    <p className="whitespace-pre-wrap">{c.texto}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Ninguém comentou ainda.</Vazio>
            )}
            {!arquivada && <Comentar tarefaId={t.id} />}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section>
            <TituloSecao>Histórico</TituloSecao>
            {t.eventos.length ? (
              <ol className="dl-panel flex flex-col gap-3 text-sm">
                {t.eventos.map((e) => {
                  const mudanca = descreverMudanca(e.tipo, e.antes, e.depois);
                  return (
                    <li key={e.id}>
                      <p>
                        <span className="font-bold">{e.ator}</span> · {ROTULO_EVENTO[e.tipo] ?? e.tipo}
                      </p>
                      {mudanca && <p className="text-ink-muted">{mudanca}</p>}
                      <p className="text-xs text-ink-subtle">{formatarDataHora(e.criadoEm)}</p>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <Vazio>Sem histórico.</Vazio>
            )}
          </section>

          {t.mensagens.length > 0 && (
            <section>
              <TituloSecao>Mensagens</TituloSecao>
              <ul className="dl-panel flex flex-col gap-2 text-sm">
                {t.mensagens.map((m) => (
                  <li key={m.id}>
                    {ROTULO_REGRA[m.regra as RegraCobranca] ?? m.regra} para {m.destinatario}
                    {m.autor ? ` (de ${m.autor})` : ""} · <span className="text-ink-muted">{ROTULO_ENVIO[m.status] ?? m.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
