"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { obterBanco } from "@/db";
import { destinoSeguro, tentarEntrar } from "@/lib/servidor/login-nucleo";
import { apagarSessoesVencidas } from "@/lib/servidor/sessao-nucleo";
import { iniciarSessao, sairDaSessao } from "@/lib/servidor/sessao";

export interface EstadoEntrar {
  erro: string | null;
  email: string;
}

const MENSAGENS = {
  credenciais: "E-mail ou senha não conferem.",
  bloqueado: "Muitas tentativas seguidas. Espere 15 minutos e tente de novo.",
  sem_acesso: "Seu acesso ao sistema foi removido. Se foi engano, fale com o Ítalo.",
} as const;

// IP de quem está tentando entrar. Na VPS o Traefik coloca o IP real no
// X-Forwarded-For (o primeiro da lista).
async function ipDaRequisicao(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

export async function entrar(_: EstadoEntrar, dados: FormData): Promise<EstadoEntrar> {
  const email = String(dados.get("email") ?? "").slice(0, 200);
  const senha = String(dados.get("senha") ?? "").slice(0, 200);
  const voltar = String(dados.get("voltar") ?? "");

  if (!email.trim() || !senha) return { erro: "Preencha e-mail e senha.", email };

  const banco = obterBanco();
  const r = await tentarEntrar(banco, { email, senha, ip: await ipDaRequisicao() });
  if (!r.ok) return { erro: MENSAGENS[r.motivo], email };

  await iniciarSessao(r.usuarioId);
  // Faxina ocasional das sessões vencidas (barata; índice por data).
  if (Math.random() < 0.1) await apagarSessoesVencidas(banco);
  redirect(destinoSeguro(voltar));
}

export async function sair(): Promise<void> {
  await sairDaSessao();
  redirect("/entrar");
}
