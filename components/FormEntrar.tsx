"use client";

import { useActionState } from "react";
import { entrar, type EstadoEntrar } from "@/app/entrar/acoes";
import { Botao, Campo } from "./ui";

export function FormEntrar({ voltar }: { voltar: string }) {
  const [estado, acao, enviando] = useActionState<EstadoEntrar, FormData>(entrar, { erro: null, email: "" });

  return (
    <form action={acao} className="dl-panel !p-5 sm:!p-6 flex flex-col gap-4" noValidate>
      <input type="hidden" name="voltar" value={voltar} />
      <Campo id="email" rotulo="E-mail" estado={estado.erro ? "error" : undefined}>
        <input
          id="email"
          name="email"
          type="email"
          className="dl-input"
          autoComplete="email"
          inputMode="email"
          defaultValue={estado.email}
          required
          autoFocus
        />
      </Campo>
      <Campo id="senha" rotulo="Senha" estado={estado.erro ? "error" : undefined} ajuda={estado.erro ?? undefined}>
        <input id="senha" name="senha" type="password" className="dl-input" autoComplete="current-password" required />
      </Campo>
      <Botao type="submit" variant="primary" size="lg" block disabled={enviando}>
        {enviando ? "Entrando..." : "Entrar"}
      </Botao>
      <p className="text-xs text-ink-subtle">
        Ainda não tem acesso? Peça um convite a alguém da equipe. Esqueceu a senha? Peça um novo convite ao Ítalo.
      </p>
    </form>
  );
}
