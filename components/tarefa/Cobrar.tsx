"use client";

import { useState, useTransition } from "react";
import { cobrarAcao } from "@/app/tarefa/acoes";
import { Botao } from "../ui";

// Qualquer pessoa cobra qualquer tarefa de outra — o Ítalo cobra a equipe e
// a equipe cobra o Ítalo. A mensagem entra na fila do WhatsApp e fica no
// histórico da tarefa. Uma cobrança por tarefa, por pessoa, por dia.
export function Cobrar({ tarefaId, responsavel, ultimaPor }: { tarefaId: string; responsavel: string; ultimaPor: string | null }) {
  const [pendente, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [recado, setRecado] = useState("");
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null);
  const nome = responsavel.split(" ")[0];

  function enviar() {
    if (pendente) return;
    iniciar(async () => {
      const r = await cobrarAcao(tarefaId, recado);
      if (r.ok) {
        setRetorno({
          ok: true,
          texto:
            r.status === "ignorado"
              ? `Cobrança registrada na tarefa, mas não vai pelo WhatsApp: ${nome} pausou as cobranças ou não cadastrou o número.`
              : `Cobrança na fila do WhatsApp de ${nome}.`,
        });
        setAberto(false);
        setRecado("");
      } else setRetorno({ ok: false, texto: r.motivo });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {!aberto ? (
        <div className="flex flex-wrap items-center gap-2">
          <Botao
            variant="success"
            onClick={() => {
              setAberto(true);
              setRetorno(null);
            }}
          >
            Cobrar {nome}
          </Botao>
          {ultimaPor && <span className="text-xs text-ink-subtle">Última cobrança: {ultimaPor}</span>}
        </div>
      ) : (
        <div className="dl-surgir flex flex-col gap-2 sm:flex-row">
          <input
            className="dl-input"
            value={recado}
            maxLength={300}
            onChange={(e) => setRecado(e.target.value)}
            placeholder={`Recado pra ${nome} (opcional)`}
            aria-label={`Recado pra ${nome}`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") enviar();
              if (e.key === "Escape") setAberto(false);
            }}
          />
          <div className="flex gap-2">
            <Botao variant="success" disabled={pendente} onClick={enviar}>
              {pendente ? "Enviando..." : "Enviar cobrança"}
            </Botao>
            <Botao variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}
      {retorno && (
        <p className={`text-xs font-semibold ${retorno.ok ? "text-success" : "text-danger"}`} role="status">
          {retorno.texto}
        </p>
      )}
    </div>
  );
}
