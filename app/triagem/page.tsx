"use client";

import Link from "next/link";
import { useState } from "react";
import { useGestao } from "@/lib/store";
import { pendenciasParaLiberar } from "@/lib/regras";
import type { Tarefa } from "@/lib/types";
import { formatarDataHora } from "@/lib/datas";
import { Botao, EtiquetaIA, TituloPagina, TituloSecao, Vazio } from "@/components/ui";

function LinhaTriagem({ tarefa }: { tarefa: Tarefa }) {
  const { usuarios, frentes, editarTarefa, mudarEstado } = useGestao();
  const [erro, setErro] = useState<string | null>(null);
  const faltas = pendenciasParaLiberar(tarefa);
  const pediu = usuarios.find((u) => u.id === tarefa.criadorId)?.nome;

  function editar(campo: "responsavelId" | "frenteId" | "prazo", valor: string) {
    const r = editarTarefa(tarefa.id, tarefa.versao, { [campo]: valor || null });
    setErro(r.ok ? null : r.motivo);
  }

  function liberar() {
    const r = mudarEstado(tarefa.id, "a_fazer");
    setErro(r.ok ? null : r.motivo);
  }

  const idBase = `tri-${tarefa.id}`;
  return (
    <div className="dl-panel flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/tarefa/${tarefa.id}`} className="font-bold hover:text-brand-text">
            {tarefa.titulo}
          </Link>
          {pediu && <p className="text-xs text-ink-muted mt-1">Pedido de {pediu}</p>}
        </div>
        {tarefa.origem === "ia" && <EtiquetaIA />}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select id={`${idBase}-resp`} aria-label="Quem faz" className="dl-input" style={!tarefa.responsavelId ? { borderColor: "var(--warning)" } : undefined} value={tarefa.responsavelId ?? ""} onChange={(e) => editar("responsavelId", e.target.value)}>
          <option value="">Quem faz?</option>
          {usuarios.filter((u) => u.ativo).map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
        <select id={`${idBase}-frente`} aria-label="Frente" className="dl-input" style={!tarefa.frenteId ? { borderColor: "var(--warning)" } : undefined} value={tarefa.frenteId ?? ""} onChange={(e) => editar("frenteId", e.target.value)}>
          <option value="">Frente?</option>
          {frentes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <input id={`${idBase}-prazo`} aria-label="Prazo" type="date" className="dl-input" style={!tarefa.prazo ? { borderColor: "var(--warning)" } : undefined} value={tarefa.prazo ?? ""} onChange={(e) => editar("prazo", e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao variant="primary" disabled={faltas.length > 0} onClick={liberar}>
          Liberar para execução
        </Botao>
        {faltas.length > 0 && <span className="text-xs font-semibold text-warning">Falta: {faltas.join(", ")}</span>}
        {erro && <span className="text-xs font-semibold text-danger">{erro}</span>}
      </div>
    </div>
  );
}

export default function Triagem() {
  const { tarefas, pedidos, usuarios } = useGestao();
  const naTriagem = tarefas.filter((t) => t.estado === "triagem");

  return (
    <div className="flex flex-col gap-8">
      <TituloPagina
        chapeu="Triagem"
        titulo="Pedidos sem dono, prazo ou frente"
        subtitulo="Qualquer pessoa pode completar e liberar. Ninguém é cobrado por eles até serem liberados."
      />

      <section className="flex flex-col gap-3 max-w-3xl">
        {naTriagem.length ? naTriagem.map((t) => <LinhaTriagem key={t.id} tarefa={t} />) : <Vazio>Triagem vazia.</Vazio>}
      </section>

      <section className="max-w-3xl">
        <TituloSecao>Pedidos em texto livre</TituloSecao>
        <p className="-mt-1 mb-3 text-sm text-ink-muted">Texto original, quem escreveu, quem interpretou e o que foi confirmado.</p>
        {pedidos.length ? (
          <div className="flex flex-col gap-2">
            {pedidos.map((p) => (
              <div key={p.id} className="dl-panel !p-3 text-sm">
                <p className="whitespace-pre-wrap">{p.texto}</p>
                <p className="mt-2 text-xs text-ink-subtle">
                  {usuarios.find((u) => u.id === p.autorId)?.nome} · {formatarDataHora(p.criadoEm)} · {p.modo === "ia" ? p.modelo : "regras, sem IA"} ·{" "}
                  {p.propostasConfirmadas} confirmada(s), {p.propostasDescartadas} descartada(s)
                </p>
              </div>
            ))}
          </div>
        ) : (
          <Vazio>Nenhum pedido em texto livre ainda.</Vazio>
        )}
      </section>
    </div>
  );
}
