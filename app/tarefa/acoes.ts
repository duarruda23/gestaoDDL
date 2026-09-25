"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import type { Estado, Prioridade } from "@/lib/types";
import {
  adicionarItem,
  alternarItem,
  arquivarTarefa,
  comentar,
  criarTarefa,
  desarquivarTarefa,
  editarTarefa,
  mudarEtapa,
  removerItem,
  type DadosTarefa,
  type Resultado,
} from "@/lib/servidor/tarefas-nucleo";
import { cobrarTarefa } from "@/lib/servidor/cobranca-nucleo";

// Server actions de tarefa. Toda ação começa pela DAL (exigirConta) e passa
// pelo núcleo, que é quem valida e registra no histórico. Depois de gravar,
// revalida as telas que mostram tarefas.

type Simples = { ok: true } | { ok: false; motivo: string };

function revalidar(id?: string) {
  for (const p of ["/", "/quadro", "/triagem", "/painel"]) revalidatePath(p);
  if (id) revalidatePath(`/tarefa/${id}`);
}

// Campo vazio vira null; texto é cortado um caractere acima do limite para o
// núcleo recusar com a mensagem certa em vez de truncar calado.
const ouNulo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const texto = (v: unknown, max: number) => String(v ?? "").slice(0, max + 1);

export type EstadoNova = { ok: boolean; mensagem: string | null };

export async function criarTarefaAcao(_: EstadoNova, dados: FormData): Promise<EstadoNova> {
  const conta = await exigirConta();
  const r = await criarTarefa(obterBanco(), conta, {
    titulo: texto(dados.get("titulo"), 200),
    descricao: texto(dados.get("descricao"), 5000),
    responsavelId: ouNulo(dados.get("responsavelId")),
    prazo: ouNulo(dados.get("prazo")),
    frenteId: ouNulo(dados.get("frenteId")),
    prioridade: (String(dados.get("prioridade") ?? "media") as Prioridade),
    itens: texto(dados.get("itens"), 10000).split("\n"),
  });
  if (!r.ok) return { ok: false, mensagem: r.motivo };
  revalidar(r.id);
  redirect(`/tarefa/${r.id}`);
}

export async function editarTarefaAcao(id: string, versao: number, edicao: Partial<DadosTarefa>): Promise<Resultado<{ versao: number }>> {
  const conta = await exigirConta();
  const limpa: Partial<DadosTarefa> = {};
  if (edicao.titulo !== undefined) limpa.titulo = texto(edicao.titulo, 200);
  if (edicao.descricao !== undefined) limpa.descricao = texto(edicao.descricao, 5000);
  if (edicao.prioridade !== undefined) limpa.prioridade = edicao.prioridade;
  for (const k of ["responsavelId", "prazo", "frenteId"] as const) if (edicao[k] !== undefined) limpa[k] = ouNulo(edicao[k]);
  const r = await editarTarefa(obterBanco(), conta, String(id), Number(versao), limpa);
  if (r.ok) revalidar(id);
  return r;
}

export async function mudarEtapaAcao(id: string, versao: number, para: Estado, motivo = ""): Promise<Resultado<{ versao: number }>> {
  const conta = await exigirConta();
  const r = await mudarEtapa(obterBanco(), conta, String(id), Number(versao), para, texto(motivo, 300));
  if (r.ok) revalidar(id);
  return r;
}

export async function arquivarAcao(id: string, versao: number): Promise<Resultado<{ versao: number }>> {
  const conta = await exigirConta();
  const r = await arquivarTarefa(obterBanco(), conta, String(id), Number(versao));
  if (r.ok) revalidar(id);
  return r;
}

export async function desarquivarAcao(id: string, versao: number): Promise<Resultado<{ versao: number; estado: Estado }>> {
  const conta = await exigirConta();
  const r = await desarquivarTarefa(obterBanco(), conta, String(id), Number(versao));
  if (r.ok) revalidar(id);
  return r;
}

export async function comentarAcao(id: string, conteudo: string): Promise<Simples> {
  const conta = await exigirConta();
  const r = await comentar(obterBanco(), conta, String(id), texto(conteudo, 2000));
  if (r.ok) revalidar(id);
  return r;
}

export async function adicionarItemAcao(id: string, conteudo: string): Promise<Simples> {
  const conta = await exigirConta();
  const r = await adicionarItem(obterBanco(), conta, String(id), texto(conteudo, 200));
  if (r.ok) revalidar(id);
  return r;
}

export async function alternarItemAcao(tarefaId: string, itemId: string): Promise<Simples> {
  const conta = await exigirConta();
  const r = await alternarItem(obterBanco(), conta, String(itemId));
  if (r.ok) revalidar(tarefaId);
  return r.ok ? { ok: true } : r;
}

export async function removerItemAcao(tarefaId: string, itemId: string): Promise<Simples> {
  const conta = await exigirConta();
  const r = await removerItem(obterBanco(), conta, String(itemId));
  if (r.ok) revalidar(tarefaId);
  return r;
}

export async function cobrarAcao(
  id: string,
  recado: string
): Promise<{ ok: true; status: "pendente" | "ignorado"; destinatario: string } | { ok: false; motivo: string }> {
  const conta = await exigirConta();
  const r = await cobrarTarefa(obterBanco(), conta, String(id), texto(recado, 300));
  if (r.ok) {
    revalidar(id);
    revalidatePath("/cobrancas");
  }
  return r;
}
