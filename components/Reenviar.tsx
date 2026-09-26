"use client";

import { useState, useTransition } from "react";
import { reenviarAcao } from "@/app/cobrancas/acoes";
import { Botao } from "./ui";

export function Reenviar({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Botao
        variant="secondary"
        className="!min-h-8 !px-3 !text-xs"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await reenviarAcao(id);
            setErro(r.ok ? null : r.motivo);
          })
        }
      >
        {pendente ? "Voltando pra fila..." : "Tentar de novo"}
      </Botao>
      {erro && <span className="text-xs font-semibold text-danger">{erro}</span>}
    </span>
  );
}
