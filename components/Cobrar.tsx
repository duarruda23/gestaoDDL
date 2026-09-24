"use client";

import { useState } from "react";
import { useGestao } from "@/lib/store";
import type { Tarefa } from "@/lib/types";
import { estaAtiva } from "@/lib/regras";
import { Botao } from "./ui";

// Qualquer pessoa cobra qualquer tarefa de outra pessoa — o Ítalo cobra a
// equipe e a equipe cobra o Ítalo. A mensagem vai pelo WhatsApp e fica no
// histórico da tarefa. Uma cobrança por tarefa, por pessoa, por dia.
export function Cobrar({ tarefa, compacto = false }: { tarefa: Tarefa; compacto?: boolean }) {
  const { usuarioAtual, usuarios, mensagens, cobrar } = useGestao();
  const [aberto, setAberto] = useState(false);
  const [recado, setRecado] = useState("");
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null);

  const resp = usuarios.find((u) => u.id === tarefa.responsavelId);
  if (!usuarioAtual || !resp || resp.id === usuarioAtual.id || !estaAtiva(tarefa)) return null;

  const ultima = mensagens.find(
    (m) => m.tarefaId === tarefa.id && m.regra === "cobranca_manual" && m.destinatarioId === resp.id
  );
  const quemCobrou = ultima ? usuarios.find((u) => u.id === ultima.autorId)?.nome : null;

  function enviar() {
    const r = cobrar(tarefa.id, recado);
    if (r.ok) {
      setRetorno({
        ok: true,
        texto:
          r.mensagem.status === "ignorado"
            ? `${resp!.nome} pausou as cobranças no WhatsApp. A cobrança ficou registrada na tarefa.`
            : `Cobrança enviada no WhatsApp de ${resp!.nome}.`,
      });
      setAberto(false);
      setRecado("");
    } else {
      setRetorno({ ok: false, texto: r.motivo });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {!aberto ? (
        <div className="flex flex-wrap items-center gap-2">
          <Botao variant="success" onClick={() => { setAberto(true); setRetorno(null); }}>
            Cobrar {resp.nome}
          </Botao>
          {!compacto && ultima && quemCobrou && (
            <span className="text-xs text-ink-subtle">Última cobrança: {quemCobrou}</span>
          )}
        </div>
      ) : (
        <div className="dl-surgir flex flex-col gap-2 sm:flex-row">
          <input
            className="dl-input"
            value={recado}
            onChange={(e) => setRecado(e.target.value)}
            placeholder={`Recado pra ${resp.nome} (opcional)`}
            aria-label={`Recado pra ${resp.nome}`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") enviar();
              if (e.key === "Escape") setAberto(false);
            }}
          />
          <div className="flex gap-2">
            <Botao variant="success" onClick={enviar}>
              Enviar cobrança
            </Botao>
            <Botao variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}
      {retorno && <p className={`text-xs font-semibold ${retorno.ok ? "text-success" : "text-danger"}`}>{retorno.texto}</p>}
    </div>
  );
}
