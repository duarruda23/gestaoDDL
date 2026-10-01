"use client";

import { useState, useTransition } from "react";
import { comentarAcao } from "@/app/tarefa/acoes";
import { Botao } from "../ui";

// Enter envia; Shift+Enter quebra a linha.
export function Comentar({ tarefaId }: { tarefaId: string }) {
  const [pendente, iniciar] = useTransition();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function enviar() {
    if (!texto.trim() || pendente) return;
    setErro(null);
    iniciar(async () => {
      const r = await comentarAcao(tarefaId, texto);
      if (r.ok) setTexto("");
      else setErro(r.motivo);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          className="dl-input !min-h-[44px]"
          rows={1}
          placeholder="Escreva um comentário"
          aria-label="Comentário"
          maxLength={2000}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <Botao variant="secondary" disabled={pendente || !texto.trim()} onClick={enviar}>
          {pendente ? "Enviando..." : "Comentar"}
        </Botao>
      </div>
      {erro && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
