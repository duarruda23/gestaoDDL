"use client";

import Link from "next/link";
import { useActionState } from "react";
import { pedir, type EstadoEsqueci } from "@/app/entrar/esqueci/acoes";
import { Botao, Campo } from "./ui";

export function FormEsqueci() {
  const [estado, acao, enviando] = useActionState<EstadoEsqueci, FormData>(pedir, { erro: null, enviado: false, email: "" });

  if (estado.enviado) {
    return (
      <div className="dl-panel !p-5 sm:!p-6 flex flex-col gap-4" role="status">
        <p className="text-sm text-ink">
          Se <b>{estado.email}</b> tiver conta no sistema, o link pra criar uma senha nova chega no WhatsApp cadastrado em até
          alguns minutos. Ele vale por 1 hora e só funciona uma vez.
        </p>
        <p className="text-xs text-ink-subtle">
          Não chegou em 10 minutos? Confira se digitou o e-mail certo e tente de novo, ou peça a alguém que cuida dos acessos
          pra gerar o link na tela Equipe.
        </p>
        <Link href="/entrar" className="dl-btn dl-btn-secondary self-start">
          Voltar pra tela de entrar
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="dl-panel !p-5 sm:!p-6 flex flex-col gap-4" noValidate>
      <Campo id="email" rotulo="E-mail da sua conta" estado={estado.erro ? "error" : undefined} ajuda={estado.erro ?? undefined}>
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
      <Botao type="submit" variant="primary" size="lg" block disabled={enviando}>
        {enviando ? "Enviando..." : "Mandar link no WhatsApp"}
      </Botao>
      <Link href="/entrar" className="self-center text-sm text-ink-subtle underline underline-offset-4">
        Lembrei a senha
      </Link>
    </form>
  );
}
