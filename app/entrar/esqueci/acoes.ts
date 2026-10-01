"use server";

import { obterBanco } from "@/db";
import { pedirRedefinicao } from "@/lib/servidor/recuperacao-nucleo";
import { ipDaRequisicao } from "@/lib/servidor/ip";

export interface EstadoEsqueci {
  erro: string | null;
  enviado: boolean;
  email: string;
}

export async function pedir(_: EstadoEsqueci, dados: FormData): Promise<EstadoEsqueci> {
  const email = String(dados.get("email") ?? "").slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { erro: "Informe o e-mail da sua conta.", enviado: false, email };

  const site = process.env.SITE_URL;
  if (!site) return { erro: "O sistema está sem o endereço do site configurado. Avise o Eduardo.", enviado: false, email };

  // O resultado não aparece na tela: mesma resposta exista ou não a conta.
  await pedirRedefinicao(obterBanco(), { email, ip: await ipDaRequisicao(), site });
  return { erro: null, enviado: true, email };
}
