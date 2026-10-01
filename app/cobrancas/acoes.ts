"use server";

import { revalidatePath } from "next/cache";
import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { definirPausa } from "@/lib/servidor/cobranca-nucleo";
import { reenviarMensagem } from "@/lib/servidor/n8n-nucleo";

// Cada pessoa só pausa as próprias cobranças.
export async function pausarCobrancasAcao(pausada: boolean): Promise<void> {
  const conta = await exigirConta();
  await definirPausa(obterBanco(), conta.id, pausada === true);
  revalidatePath("/cobrancas");
}

// Modelo horizontal: qualquer pessoa põe de volta na fila uma mensagem que falhou.
export async function reenviarAcao(id: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  await exigirConta();
  const r = await reenviarMensagem(obterBanco(), String(id));
  if (!r.ok) return r;
  revalidatePath("/cobrancas");
  revalidatePath("/painel");
  return { ok: true };
}
