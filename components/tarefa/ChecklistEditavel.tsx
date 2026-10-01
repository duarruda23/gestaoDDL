"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { TarefaDetalhe } from "@/lib/visao";
import { adicionarItemAcao, alternarItemAcao, aplicarModeloAcao, removerItemAcao, salvarComoModeloAcao } from "@/app/tarefa/acoes";
import { Botao } from "../ui";

// Marcar item responde na hora (useOptimistic) e confirma no servidor.
// Modelos (bloco D): aplicar acrescenta os passos de um modelo; "salvar como
// modelo" guarda este checklist para reusar em outras tarefas.
export function ChecklistEditavel({
  tarefaId,
  itens,
  arquivada,
  modelos,
}: {
  tarefaId: string;
  itens: TarefaDetalhe["checklist"];
  arquivada: boolean;
  modelos: { id: string; nome: string }[];
}) {
  const [modeloId, setModeloId] = useState("");
  const [nomeModelo, setNomeModelo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [otimista, alternarOtimista] = useOptimistic(itens, (atual, id: string) =>
    atual.map((c) => (c.id === id ? { ...c, concluido: !c.concluido } : c))
  );

  function alternar(id: string) {
    setErro(null);
    iniciar(async () => {
      alternarOtimista(id);
      const r = await alternarItemAcao(tarefaId, id);
      if (!r.ok) setErro(r.motivo);
    });
  }

  function adicionar() {
    if (!novo.trim()) return;
    setErro(null);
    iniciar(async () => {
      const r = await adicionarItemAcao(tarefaId, novo);
      if (r.ok) setNovo("");
      else setErro(r.motivo);
    });
  }

  function aplicar() {
    if (!modeloId) return;
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await aplicarModeloAcao(tarefaId, modeloId);
      if (!r.ok) setErro(r.motivo);
      else {
        setModeloId("");
        setAviso(r.adicionados ? null : "Todos os itens do modelo já estavam no checklist.");
      }
    });
  }

  function salvarModelo() {
    if (!nomeModelo?.trim()) return;
    setErro(null);
    iniciar(async () => {
      const r = await salvarComoModeloAcao(tarefaId, nomeModelo);
      if (!r.ok) setErro(r.motivo);
      else {
        setNomeModelo(null);
        setAviso("Modelo salvo. Ele aparece em “Aplicar modelo” em qualquer tarefa.");
      }
    });
  }

  function remover(id: string) {
    setErro(null);
    iniciar(async () => {
      const r = await removerItemAcao(tarefaId, id);
      if (!r.ok) setErro(r.motivo);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {otimista.length > 0 && (
        <ul className="dl-panel flex flex-col gap-1 text-[15px]">
          {otimista.map((c) => (
            <li key={c.id} className="group flex items-center gap-2">
              <label className="flex flex-1 items-center gap-2 py-1">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--brand)]"
                  checked={c.concluido}
                  disabled={arquivada}
                  onChange={() => alternar(c.id)}
                />
                <span className={c.concluido ? "line-through text-ink-subtle" : ""}>{c.texto}</span>
              </label>
              {!arquivada && (
                <button
                  type="button"
                  className="text-xs font-semibold text-ink-subtle hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                  onClick={() => remover(c.id)}
                  aria-label={`Remover item: ${c.texto}`}
                >
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {otimista.length === 0 && arquivada && <p className="text-sm text-ink-subtle">Sem checklist.</p>}
      {!arquivada && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="dl-input"
            placeholder="Novo item"
            aria-label="Novo item do checklist"
            maxLength={200}
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
          />
          <Botao variant="secondary" disabled={pendente || !novo.trim()} onClick={adicionar}>
            Adicionar
          </Botao>
        </div>
      )}
      {!arquivada && (modelos.length > 0 || otimista.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {modelos.length > 0 && (
            <>
              <select className="dl-input sm:!w-auto" aria-label="Modelo de checklist" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
                <option value="">Aplicar modelo…</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
              {modeloId && (
                <Botao variant="secondary" disabled={pendente} onClick={aplicar}>
                  Aplicar
                </Botao>
              )}
            </>
          )}
          {otimista.length > 0 && nomeModelo === null && (
            <Botao variant="ghost" disabled={pendente} onClick={() => setNomeModelo("")}>
              Salvar como modelo
            </Botao>
          )}
        </div>
      )}
      {nomeModelo !== null && (
        <div className="dl-surgir flex flex-col gap-2 sm:flex-row">
          <input
            className="dl-input"
            placeholder="Nome do modelo (ex.: Presencial: pré-evento)"
            aria-label="Nome do modelo"
            maxLength={80}
            value={nomeModelo}
            onChange={(e) => setNomeModelo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && salvarModelo()}
            autoFocus
          />
          <Botao variant="secondary" disabled={pendente || !nomeModelo.trim()} onClick={salvarModelo}>
            Salvar modelo
          </Botao>
          <Botao variant="ghost" onClick={() => setNomeModelo(null)}>
            Cancelar
          </Botao>
        </div>
      )}
      {aviso && <p className="text-sm text-ink-muted" role="status">{aviso}</p>}
      {erro && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
