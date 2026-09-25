import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Banco } from "@/db";
import { tarefas, usuarios } from "@/db/schema";
import { diferencaDias, hojeISO, somarDias } from "@/lib/datas";
import { enfileirar, lerConfig, primeiroNome, type NovaMensagem } from "./fila";

// Cobranças automáticas (bloco C, seção 7 do spec). O n8n chama isto em
// horário comercial (POST /api/n8n/gerar); rodar várias vezes no mesmo dia
// não duplica nada, porque a chave leva a data.
//
// Modelo horizontal: não existe gestor para escalonar. Quando uma tarefa
// fica vencida há alguns dias, quem é avisado é quem PEDIU — o Ítalo ou um
// colega.

const resp = alias(usuarios, "resp");
const criador = alias(usuarios, "criador");

export interface ResultadoRodada {
  novas: number;
  ignoradas: number; // entraram como "ignorado" (pausada, sem WhatsApp, limite)
  jaExistiam: number;
}

export async function gerarCobrancasAutomaticas(banco: Banco, hoje = hojeISO()): Promise<ResultadoRodada> {
  const config = await lerConfig(banco);
  const resultado: ResultadoRodada = { novas: 0, ignoradas: 0, jaExistiam: 0 };
  if (!config?.ativa) return resultado;

  // Só o que interessa: ativas, liberadas, com dono e vencendo até amanhã.
  const lista = await banco
    .select({
      id: tarefas.id,
      titulo: tarefas.titulo,
      estado: tarefas.estado,
      prazo: tarefas.prazo,
      responsavelId: tarefas.responsavelId,
      criadorId: tarefas.criadorId,
      respNome: resp.nome,
      criadorNome: criador.nome,
      criadorAtivo: criador.ativo,
    })
    .from(tarefas)
    .innerJoin(resp, eq(resp.id, tarefas.responsavelId))
    .innerJoin(criador, eq(criador.id, tarefas.criadorId))
    .where(
      and(
        inArray(tarefas.estado, ["a_fazer", "em_andamento", "em_revisao", "bloqueada"]),
        isNotNull(tarefas.prazo),
        lte(tarefas.prazo, somarDias(hoje, 1))
      )
    );

  const candidatas: NovaMensagem[] = [];
  for (const t of lista) {
    const dif = diferencaDias(hoje, t.prazo!);
    const nome = primeiroNome(t.respNome);
    const pediu = primeiroNome(t.criadorNome);

    if (dif === 1) {
      candidatas.push({
        chave: `${t.id}|prazo_proximo|${hoje}|${t.responsavelId}`,
        tarefaId: t.id,
        regra: "prazo_proximo",
        autorId: null,
        destinatarioId: t.responsavelId!,
        texto: `${nome}, lembrete: *${t.titulo}* vence amanhã.`,
      });
    }

    // Bloqueada não recebe cobrança de atraso: o bloqueio já está registrado.
    if (dif < 0 && t.estado !== "bloqueada") {
      const atraso = dif === -1 ? "ontem" : `há ${-dif} dias`;
      const deQuem = t.criadorId === t.responsavelId ? "" : ` (pedido de ${pediu})`;
      candidatas.push({
        chave: `${t.id}|vencida|${hoje}|${t.responsavelId}`,
        tarefaId: t.id,
        regra: "vencida",
        autorId: null,
        destinatarioId: t.responsavelId!,
        texto: `${nome}, *${t.titulo}*${deQuem} venceu ${atraso}. Consegue atualizar o andamento no sistema?`,
      });
      if (-dif >= config.diasParaAvisarQuemPediu && t.criadorId !== t.responsavelId && t.criadorAtivo) {
        candidatas.push({
          chave: `${t.id}|escalonamento|${hoje}|${t.criadorId}`,
          tarefaId: t.id,
          regra: "escalonamento",
          autorId: null,
          destinatarioId: t.criadorId,
          texto: `${pediu}, o que você pediu pra ${nome} (*${t.titulo}*) está vencido há ${-dif} dias.`,
        });
      }
    }
  }

  for (const c of candidatas) {
    const r = await enfileirar(banco, c, hoje);
    if (!r.inserida) resultado.jaExistiam++;
    else if (r.status === "ignorado") resultado.ignoradas++;
    else resultado.novas++;
  }
  return resultado;
}
