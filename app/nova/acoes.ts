"use server";

import { revalidatePath } from "next/cache";
import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { escolherProvedor } from "@/lib/provedor-ia";
import type { Prioridade } from "@/lib/types";
import {
  confirmarProposta,
  descartarProposta,
  interpretarPedido,
  LIMITE_CARACTERES,
  type ResultadoPedido,
} from "@/lib/servidor/pedidos-nucleo";

// Server actions do pedido em texto livre (bloco B). A chave da IA só existe
// no servidor; a equipe e o autor vêm do banco e da sessão, nunca do navegador.

export async function interpretarAcao(texto: string): Promise<({ ok: true } & ResultadoPedido) | { ok: false; motivo: string }> {
  const conta = await exigirConta();
  return interpretarPedido(obterBanco(), conta, String(texto ?? "").slice(0, LIMITE_CARACTERES + 1), escolherProvedor());
}

export interface DadosConfirmacao {
  titulo: string;
  descricao: string;
  responsavelId: string | null;
  prazo: string | null;
  frenteId: string | null;
  prioridade: Prioridade;
  itens: string[];
  envolvidosIds: string[];
}

const ouNulo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function confirmarPropostaAcao(
  propostaId: string,
  d: DadosConfirmacao
): Promise<{ ok: true; tarefaId: string; estado: string } | { ok: false; motivo: string }> {
  const conta = await exigirConta();
  const r = await confirmarProposta(obterBanco(), conta, String(propostaId), {
    titulo: String(d.titulo ?? "").slice(0, 201),
    descricao: String(d.descricao ?? "").slice(0, 5001),
    responsavelId: ouNulo(d.responsavelId),
    prazo: ouNulo(d.prazo),
    frenteId: ouNulo(d.frenteId),
    prioridade: d.prioridade,
    itens: Array.isArray(d.itens) ? d.itens.map(String).slice(0, 31) : [],
    envolvidosIds: Array.isArray(d.envolvidosIds) ? d.envolvidosIds.map(String).slice(0, 20) : [],
  });
  if (r.ok) for (const p of ["/", "/quadro", "/triagem", "/painel", "/nova"]) revalidatePath(p);
  return r;
}

export async function descartarPropostaAcao(propostaId: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const conta = await exigirConta();
  const r = await descartarProposta(obterBanco(), conta, String(propostaId));
  if (r.ok) revalidatePath("/nova");
  return r;
}
