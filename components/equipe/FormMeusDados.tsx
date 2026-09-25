"use client";

import { useActionState } from "react";
import { salvarMeusDados, type EstadoAcao } from "@/app/equipe/acoes";
import { Botao, Campo } from "../ui";

export function FormMeusDados({ nome, funcao, whatsapp }: { nome: string; funcao: string; whatsapp: string }) {
  const [estado, acao, salvando] = useActionState<EstadoAcao, FormData>(salvarMeusDados, { ok: false, mensagem: null });

  return (
    <form action={acao} className="dl-panel !p-5 sm:!p-6 flex flex-col gap-4">
      <div>
        <p className="dl-eyebrow">Seus dados</p>
        <p className="mt-1 text-sm text-ink-muted">O WhatsApp é por onde chegam os avisos e as cobranças.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="md-nome" rotulo="Nome">
          <input id="md-nome" name="nome" className="dl-input" defaultValue={nome} autoComplete="name" required />
        </Campo>
        <Campo id="md-funcao" rotulo="O que você faz">
          <input id="md-funcao" name="funcao" className="dl-input" defaultValue={funcao} placeholder="Ex.: Edição de vídeo" />
        </Campo>
        <Campo id="md-whats" rotulo="WhatsApp" estado={!whatsapp ? "pending" : undefined} ajuda={!whatsapp ? "Falta preencher." : undefined}>
          <input id="md-whats" name="whatsapp" className="dl-input" defaultValue={whatsapp} placeholder="+55 81 99999-0000" inputMode="tel" autoComplete="tel" />
        </Campo>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variant="primary" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Botao>
        {estado.mensagem && (
          <span className={`text-sm font-semibold ${estado.ok ? "text-success" : "text-danger"}`} role="status">
            {estado.mensagem}
          </span>
        )}
      </div>
    </form>
  );
}
