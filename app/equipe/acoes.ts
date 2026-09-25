"use server";

import { revalidatePath } from "next/cache";
import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { criarConvite } from "@/lib/servidor/convite-nucleo";
import { atualizarMeusDados, definirGerenciaAcessos, removerAcesso, restaurarAcesso } from "@/lib/servidor/acessos-nucleo";

// Server actions da tela Equipe. Toda ação começa pela DAL (exigirConta):
// sem sessão válida, nada acontece. As regras ficam no núcleo, testadas.

export type EstadoAcao = { ok: boolean; mensagem: string | null };

const texto = (d: FormData, campo: string, max = 200) => String(d.get(campo) ?? "").slice(0, max);

export async function salvarMeusDados(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const conta = await exigirConta();
  const r = await atualizarMeusDados(obterBanco(), conta, {
    nome: texto(dados, "nome", 80),
    funcao: texto(dados, "funcao", 80),
    telefoneWhatsapp: texto(dados, "whatsapp", 30),
  });
  if (!r.ok) return { ok: false, mensagem: r.motivo };
  revalidatePath("/", "layout"); // o nome aparece no cabeçalho de todas as telas
  return { ok: true, mensagem: "Dados salvos." };
}

export type EstadoConvite = EstadoAcao & { link: string | null; nome: string; whatsapp: string; redefinir: boolean };

export async function convidar(_: EstadoConvite, dados: FormData): Promise<EstadoConvite> {
  const conta = await exigirConta();
  const nome = texto(dados, "nome", 80);
  const whatsapp = texto(dados, "whatsapp", 30);
  const r = await criarConvite(obterBanco(), conta, { nome, email: texto(dados, "email"), telefoneWhatsapp: whatsapp });
  if (!r.ok) return { ok: false, mensagem: r.motivo, link: null, nome, whatsapp, redefinir: false };
  const site = process.env.SITE_URL ?? "";
  revalidatePath("/equipe");
  return {
    ok: true,
    mensagem: null,
    link: `${site}/convite/${r.token}`,
    nome,
    whatsapp,
    redefinir: r.tipo === "redefinir_senha",
  };
}

export async function removerAcessoAcao(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const conta = await exigirConta();
  const r = await removerAcesso(obterBanco(), conta, texto(dados, "alvoId", 60), texto(dados, "motivo", 300));
  if (!r.ok) return { ok: false, mensagem: r.motivo };
  revalidatePath("/equipe");
  return { ok: true, mensagem: "Acesso removido." };
}

export async function restaurarAcessoAcao(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const conta = await exigirConta();
  const r = await restaurarAcesso(obterBanco(), conta, texto(dados, "alvoId", 60));
  if (!r.ok) return { ok: false, mensagem: r.motivo };
  revalidatePath("/equipe");
  return { ok: true, mensagem: "Acesso restaurado." };
}

export async function permissaoAcao(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const conta = await exigirConta();
  const r = await definirGerenciaAcessos(obterBanco(), conta, texto(dados, "alvoId", 60), dados.get("pode") === "sim");
  if (!r.ok) return { ok: false, mensagem: r.motivo };
  revalidatePath("/equipe");
  return { ok: true, mensagem: null };
}
