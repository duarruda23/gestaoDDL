"use client";

import { useState, useTransition } from "react";
import type { ModeloVisao } from "@/lib/servidor/modelos-nucleo";
import { arquivarModeloAcao } from "@/app/equipe/acoes";
import { Botao } from "../ui";

// Modelos de checklist da equipe. Criam-se pela tarefa ("Salvar como modelo");
// aqui dá pra ver o que existe e arquivar o que não serve mais.
export function ListaModelos({ modelos }: { modelos: ModeloVisao[] }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="dl-eyebrow">Modelos de checklist</p>
        <p className="mt-1 text-sm text-ink-muted">
          Para criar um, monte o checklist numa tarefa e use “Salvar como modelo”. Depois é só aplicar em outras tarefas ou escolher ao pedir.
        </p>
      </div>
      {modelos.length === 0 ? (
        <p className="dl-empty">Nenhum modelo ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {modelos.map((m) => (
            <li key={m.id} className="dl-panel !p-3 flex flex-wrap items-start justify-between gap-2 text-sm">
              <details className="min-w-0 flex-1">
                <summary className="cursor-pointer">
                  <strong>{m.nome}</strong>
                  <span className="text-ink-muted">
                    {" "}
                    · {m.itens.length} {m.itens.length === 1 ? "item" : "itens"}
                    {m.frente ? ` · ${m.frente.nome}` : ""}
                  </span>
                </summary>
                <ol className="mt-2 list-decimal pl-5 text-ink-muted">
                  {m.itens.map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                </ol>
              </details>
              <Botao
                variant="ghost"
                className="!min-h-8 !px-3 !text-xs"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await arquivarModeloAcao(m.id);
                    setErro(r.ok ? null : r.mensagem);
                  })
                }
              >
                Arquivar
              </Botao>
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
