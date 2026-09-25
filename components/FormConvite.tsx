"use client";

import { useActionState } from "react";
import { aceitar, type EstadoConvite } from "@/app/convite/[token]/acoes";
import { SENHA_MINIMA } from "@/lib/servidor/senha-regras";
import { Botao, Campo } from "./ui";

export function FormConvite({ token, email, redefinir }: { token: string; email: string; redefinir: boolean }) {
  const [estado, acao, enviando] = useActionState<EstadoConvite, FormData>(aceitar, { erro: null });

  return (
    <form action={acao} className="dl-panel !p-5 sm:!p-6 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {/* E-mail visível (e para o gerenciador de senhas salvar o par certo). */}
      <Campo id="email" rotulo="Seu e-mail de acesso">
        <input id="email" name="email" type="email" className="dl-input" value={email} readOnly autoComplete="username" />
      </Campo>
      <Campo id="senha" rotulo={redefinir ? "Nova senha" : "Crie uma senha"} ajuda={`Pelo menos ${SENHA_MINIMA} caracteres.`}>
        <input id="senha" name="senha" type="password" className="dl-input" autoComplete="new-password" minLength={SENHA_MINIMA} required autoFocus />
      </Campo>
      <Campo id="confirmacao" rotulo="Repita a senha" estado={estado.erro ? "error" : undefined} ajuda={estado.erro ?? undefined}>
        <input id="confirmacao" name="confirmacao" type="password" className="dl-input" autoComplete="new-password" required />
      </Campo>
      <Botao type="submit" variant="primary" size="lg" block disabled={enviando}>
        {enviando ? "Salvando..." : redefinir ? "Salvar nova senha e entrar" : "Criar conta e entrar"}
      </Botao>
    </form>
  );
}
