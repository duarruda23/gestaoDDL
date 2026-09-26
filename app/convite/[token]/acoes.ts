"use server";

import { redirect } from "next/navigation";
import { obterBanco } from "@/db";
import { aceitarConvite } from "@/lib/servidor/convite-nucleo";
import { iniciarSessao } from "@/lib/servidor/sessao";

export interface EstadoConvite {
  erro: string | null;
}

export async function aceitar(_: EstadoConvite, dados: FormData): Promise<EstadoConvite> {
  const token = String(dados.get("token") ?? "");
  const senha = String(dados.get("senha") ?? "").slice(0, 200);
  const confirmacao = String(dados.get("confirmacao") ?? "").slice(0, 200);
  if (senha !== confirmacao) return { erro: "As duas senhas não são iguais." };

  const r = await aceitarConvite(obterBanco(), token, senha);
  if (!r.ok) return { erro: r.motivo };

  await iniciarSessao(r.usuarioId);
  redirect("/");
}
