"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { TarefaDetalhe } from "@/lib/visao";
import { adicionarItemAcao, alternarItemAcao, removerItemAcao } from "@/app/tarefa/acoes";
import { Botao } from "../ui";

// Marcar item responde na hora (useOptimistic) e confirma no servidor.
export function ChecklistEditavel({
  tarefaId,
  itens,
  arquivada,
}: {
  tarefaId: string;
  itens: TarefaDetalhe["checklist"];
  arquivada: boolean;
}) {
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
      {erro && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
