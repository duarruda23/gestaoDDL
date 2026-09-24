"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useGestao } from "@/lib/store";
import type { Estado, EventoTarefa, Prioridade, Tarefa } from "@/lib/types";
import { ROTULO_ESTADO, ROTULO_PRIORIDADE, ROTULO_REGRA, rotuloTransicao, transicoesPermitidas } from "@/lib/regras";
import { descreverPrazo, formatarDataHora } from "@/lib/datas";
import { Avatar, Botao, Campo, EtiquetaEstado, EtiquetaIA, EtiquetaPrazo, EtiquetaPrioridade } from "@/components/ui";
import { Cobrar } from "@/components/Cobrar";

function descreverEvento(e: EventoTarefa): string {
  const estado = (v: string | null) => (v ? ROTULO_ESTADO[v.split(" ")[0] as Estado] ?? v : "");
  switch (e.tipo) {
    case "criada":
    case "confirmada_ia":
    case "checklist":
    case "cobranca":
    case "acesso":
      return e.depois ?? "";
    case "estado": {
      const [para, ...resto] = (e.depois ?? "").split(" — ");
      return `Mudou de ${estado(e.antes)} para ${estado(para)}${resto.length ? ` (${resto.join(" — ")})` : ""}`;
    }
    case "responsavel":
      return `Quem faz: ${e.antes} → ${e.depois}`;
    case "prazo":
      return `Prazo: ${descreverPrazo(e.antes)} → ${descreverPrazo(e.depois)}`;
    case "prioridade":
      return e.antes
        ? `Prioridade: ${ROTULO_PRIORIDADE[e.antes as Prioridade]} → ${ROTULO_PRIORIDADE[e.depois as Prioridade]}`
        : `Prioridade ${e.depois}`;
    case "comentario":
      return `Comentou: "${e.depois}"`;
  }
}

function PainelEdicao({ tarefa }: { tarefa: Tarefa }) {
  const { usuarios, editarTarefa, simularEdicaoExterna } = useGestao();
  // Versão carregada quando a edição começou: base da checagem de conflito.
  const [versao, setVersao] = useState(tarefa.versao);
  const [resp, setResp] = useState(tarefa.responsavelId ?? "");
  const [prazo, setPrazo] = useState(tarefa.prazo ?? "");
  const [prio, setPrio] = useState<Prioridade>(tarefa.prioridade);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function salvar() {
    const r = editarTarefa(tarefa.id, versao, { responsavelId: resp || null, prazo: prazo || null, prioridade: prio });
    if (r.ok) {
      setVersao(versao + 1);
      setMsg({ ok: true, texto: "Salvo." });
    } else setMsg({ ok: false, texto: r.motivo });
  }

  function recarregar() {
    setVersao(tarefa.versao);
    setResp(tarefa.responsavelId ?? "");
    setPrazo(tarefa.prazo ?? "");
    setPrio(tarefa.prioridade);
    setMsg(null);
  }

  return (
    <div className="dl-panel flex flex-col gap-4">
      <p className="dl-eyebrow">Editar</p>
      <Campo id="ed-resp" rotulo="Quem faz">
        <select id="ed-resp" className="dl-input" value={resp} onChange={(e) => setResp(e.target.value)}>
          <option value="">Sem responsável</option>
          {usuarios.filter((u) => u.ativo || u.id === tarefa.responsavelId).map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo id="ed-prazo" rotulo="Prazo">
        <input id="ed-prazo" type="date" className="dl-input" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
      </Campo>
      <Campo id="ed-prio" rotulo="Prioridade">
        <select id="ed-prio" className="dl-input" value={prio} onChange={(e) => setPrio(e.target.value as Prioridade)}>
          {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
            <option key={p} value={p}>
              {ROTULO_PRIORIDADE[p]}
            </option>
          ))}
        </select>
      </Campo>
      <div className="flex flex-wrap gap-2">
        <Botao variant="primary" onClick={salvar}>
          Salvar
        </Botao>
        {msg && !msg.ok && (
          <Botao variant="secondary" onClick={recarregar}>
            Recarregar dados
          </Botao>
        )}
      </div>
      {msg && <p className={`text-xs font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>{msg.texto}</p>}
      <button
        className="self-start text-[11px] text-ink-subtle underline"
        onClick={() => simularEdicaoExterna(tarefa.id)}
        title="Para testar duas pessoas editando a mesma tarefa"
      >
        Demo: simular outra pessoa editando agora
      </button>
    </div>
  );
}

export default function DetalheTarefa() {
  const { id } = useParams<{ id: string }>();
  const { usuarioAtual, tarefas, usuarios, frentes, eventos, mensagens, mudarEstado, comentar, alternarChecklist, arquivar } = useGestao();
  const [motivo, setMotivo] = useState("");
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const tarefa = tarefas.find((t) => t.id === id);
  if (!tarefa) {
    return (
      <div className="dl-panel text-center">
        <p className="font-bold">Tarefa não encontrada</p>
        <Link href="/quadro" className="dl-link mt-2 inline-block text-sm">
          Voltar ao quadro
        </Link>
      </div>
    );
  }

  const nome = (uid: string | null) => usuarios.find((u) => u.id === uid)?.nome ?? "—";
  const frente = frentes.find((f) => f.id === tarefa.frenteId);
  const transicoes = transicoesPermitidas(tarefa, frente);
  const historico = eventos.filter((e) => e.tarefaId === tarefa.id);
  const msgs = mensagens.filter((m) => m.tarefaId === tarefa.id);
  const ehMinha = tarefa.responsavelId === usuarioAtual?.id;

  function transicionar(para: Estado) {
    if (para === "bloqueada" && !pedindoMotivo) {
      setPedindoMotivo(true);
      return;
    }
    const r = mudarEstado(tarefa!.id, para, para === "bloqueada" ? motivo : undefined);
    if (r.ok) {
      setPedindoMotivo(false);
      setMotivo("");
      setErro(null);
    } else setErro(r.motivo);
  }

  function enviarComentario() {
    if (!comentario.trim()) return;
    comentar(tarefa!.id, comentario.trim());
    setComentario("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6 min-w-0">
        <div>
          <Link href="/quadro" className="text-sm font-semibold text-ink-muted hover:text-ink">
            ← Quadro
          </Link>
          <p className="dl-eyebrow mt-3">{frente?.nome ?? "Sem frente"}</p>
          <h1 className="dl-heading">{tarefa.titulo}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EtiquetaEstado estado={tarefa.estado} />
            <EtiquetaPrioridade prioridade={tarefa.prioridade} />
            <EtiquetaPrazo tarefa={tarefa} />
            {tarefa.origem === "ia" && <EtiquetaIA />}
          </div>
        </div>

        <dl className="dl-panel grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="dl-field-label">Quem faz</dt>
            <dd className="mt-1 flex items-center gap-2 font-semibold">
              <Avatar nome={tarefa.responsavelId ? nome(tarefa.responsavelId) : null} />
              {tarefa.responsavelId ? nome(tarefa.responsavelId) : "Ninguém"}
              {ehMinha && <span className="text-xs text-ink-subtle">(você)</span>}
            </dd>
          </div>
          <div>
            <dt className="dl-field-label">Quem pediu</dt>
            <dd className="mt-1 font-semibold">
              {nome(tarefa.criadorId)}
              {tarefa.criadorId === usuarioAtual?.id && <span className="text-xs text-ink-subtle"> (você)</span>}
            </dd>
          </div>
          <div>
            <dt className="dl-field-label">Prazo</dt>
            <dd className="mt-1 font-semibold">{descreverPrazo(tarefa.prazo)}</dd>
          </div>
          <div>
            <dt className="dl-field-label">Envolvidos</dt>
            <dd className="mt-1 font-semibold">{tarefa.envolvidosIds.map(nome).join(", ") || "—"}</dd>
          </div>
        </dl>

        {tarefa.estado === "bloqueada" && tarefa.motivoBloqueio && (
          <div className="dl-callout dl-callout-danger">
            <p className="dl-callout-title">Bloqueada</p>
            {tarefa.motivoBloqueio}
          </div>
        )}

        {!ehMinha && <Cobrar tarefa={tarefa} />}

        {tarefa.estado !== "arquivada" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {transicoes.map((para) => (
                <Botao
                  key={para}
                  onClick={() => transicionar(para)}
                  variant={
                    para === "concluida" || (tarefa.estado === "triagem" && para === "a_fazer")
                      ? "primary"
                      : para === "bloqueada"
                        ? "danger"
                        : "secondary"
                  }
                >
                  {rotuloTransicao(tarefa.estado, para)}
                </Botao>
              ))}
              <Botao variant="ghost" onClick={() => arquivar(tarefa.id)}>
                Arquivar
              </Botao>
            </div>
            {pedindoMotivo && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="dl-input" placeholder="O que está travando? (obrigatório)" aria-label="Motivo do bloqueio" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                <Botao variant="danger" onClick={() => transicionar("bloqueada")}>
                  Confirmar bloqueio
                </Botao>
              </div>
            )}
            {erro && <p className="text-sm font-semibold text-danger">{erro}</p>}
          </div>
        )}

        {tarefa.descricao && (
          <section>
            <p className="dl-eyebrow mb-2">Contexto</p>
            <p className="text-[15px] leading-[22px] whitespace-pre-wrap text-ink-muted">{tarefa.descricao}</p>
          </section>
        )}

        {tarefa.checklist.length > 0 && (
          <section>
            <p className="dl-eyebrow mb-2">Checklist</p>
            <ul className="flex flex-col gap-2">
              {tarefa.checklist.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-2 text-[15px]">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={c.concluido} onChange={() => alternarChecklist(tarefa.id, c.id)} />
                    <span className={c.concluido ? "line-through text-ink-subtle" : ""}>{c.texto}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className="dl-eyebrow mb-2">Comentários</p>
          <div className="flex flex-col gap-2">
            {tarefa.comentarios.map((c) => (
              <div key={c.id} className="dl-panel !p-3 text-sm">
                <p className="text-xs text-ink-subtle">
                  <strong className="text-ink">{nome(c.autorId)}</strong> · {formatarDataHora(c.criadoEm)}
                </p>
                <p className="mt-1">{c.texto}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="dl-input"
              placeholder="Escreva um comentário"
              aria-label="Comentário"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviarComentario()}
            />
            <Botao variant="secondary" disabled={!comentario.trim()} onClick={enviarComentario}>
              Comentar
            </Botao>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        {tarefa.estado !== "arquivada" && <PainelEdicao key={tarefa.id} tarefa={tarefa} />}

        <div className="dl-panel">
          <p className="dl-eyebrow mb-3">WhatsApp</p>
          {msgs.length ? (
            <ul className="flex flex-col gap-2">
              {msgs.map((m) => (
                <li key={m.id} className="text-xs">
                  <span className="font-bold">{m.regra === "cobranca_manual" ? `${nome(m.autorId)} cobrou` : ROTULO_REGRA[m.regra]}</span> → {nome(m.destinatarioId)} ·{" "}
                  <span className={m.status === "falhou" ? "text-danger font-semibold" : m.status === "enviado" ? "text-success font-semibold" : "text-ink-subtle"}>
                    {m.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-subtle">Nenhuma mensagem para esta tarefa.</p>
          )}
        </div>

        <div className="dl-panel">
          <p className="dl-eyebrow mb-3">Histórico</p>
          <ol className="flex flex-col gap-3">
            {historico.map((e) => (
              <li key={e.id} className="text-xs">
                <p>{descreverEvento(e)}</p>
                <p className="text-ink-subtle">
                  {nome(e.atorId)} · {formatarDataHora(e.criadoEm)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
