"use server";

import { revalidatePath } from "next/cache";
import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { definirPausa } from "@/lib/servidor/cobranca-nucleo";

// Cada pessoa só pausa as próprias cobranças.
export async function pausarCobrancasAcao(pausada: boolean): Promise<void> {
  const conta = await exigirConta();
  await definirPausa(obterBanco(), conta.id, pausada === true);
  revalidatePath("/cobrancas");
}
