"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { criarSerie, editarSerie, mudarEstadoSerie, type DadosSerie } from "@/lib/servidor/series-nucleo";

const base = {
  intervalo: z.number().int().min(1).max(365),
  inicioEm: z.iso.date(),
  fimEm: z.iso.date().nullable().optional(),
};
const regra = z.discriminatedUnion("frequencia", [
  z.object({ ...base, frequencia: z.literal("diaria") }),
  z.object({ ...base, frequencia: z.literal("semanal"), diasSemana: z.array(z.number().int().min(1).max(7)).min(1) }),
  z.object({ ...base, frequencia: z.literal("personalizada"), diasSemana: z.array(z.number().int().min(1).max(7)).min(1) }),
  z.object({ ...base, frequencia: z.literal("mensal"), diaMes: z.number().int().min(1).max(31).optional(), ultimoDiaMes: z.boolean().optional() }),
  z.object({ ...base, frequencia: z.literal("anual"), mesAno: z.number().int().min(1).max(12), diaAno: z.number().int().min(1).max(31) }),
]);
const dadosSchema = z.object({
  titulo: z.string().max(200), descricao: z.string().max(5000),
  frenteId: z.uuid(), responsavelId: z.uuid(),
  prioridade: z.enum(["baixa", "media", "alta", "urgente"]),
  horaVencimento: z.string().nullable(),
  regra,
});

function revisar(dados: unknown): DadosSerie | null {
  const r = dadosSchema.safeParse(dados);
  return r.success ? r.data as DadosSerie : null;
}

export async function criarSerieAcao(dados: DadosSerie) {
  const ator = await exigirConta();
  const validos = revisar(dados);
  if (!validos) return { ok: false as const, motivo: "Confira os campos da série." };
  const resultado = await criarSerie(obterBanco(), ator, validos);
  if (resultado.ok) { revalidatePath("/series"); revalidatePath("/nova"); }
  return resultado;
}

export async function editarSerieAcao(id: string, versao: number, dados: DadosSerie, aplicarResponsavelAbertas: boolean) {
  const ator = await exigirConta();
  const validos = revisar(dados);
  if (!validos || typeof aplicarResponsavelAbertas !== "boolean") return { ok: false as const, motivo: "Confira os campos da série." };
  const resultado = await editarSerie(obterBanco(), ator, id, versao, validos, aplicarResponsavelAbertas);
  if (resultado.ok) { revalidatePath("/series"); revalidatePath(`/series/${id}`); revalidatePath("/quadro"); }
  return resultado;
}

export async function mudarEstadoSerieAcao(id: string, versao: number, acao: "pausar" | "retomar" | "encerrar", motivo: string) {
  const ator = await exigirConta();
  if (!["pausar", "retomar", "encerrar"].includes(acao) || typeof motivo !== "string") return { ok: false as const, motivo: "Ação inválida." };
  const resultado = await mudarEstadoSerie(obterBanco(), ator, id, versao, acao, motivo);
  if (resultado.ok) { revalidatePath("/series"); revalidatePath(`/series/${id}`); }
  return resultado;
}
