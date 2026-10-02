import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Banco } from "@/db";
import { tarefas, usuarios } from "@/db/schema";
import { diferencaDias, formatarHora, hojeISO, horaAtual, somarDias } from "@/lib/datas";
import { vencimentoAtingido } from "@/lib/recorrencia/calendario";
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

export async function gerarCobrancasAutomaticas(banco: Banco, hoje = hojeISO(), agora = horaAtual(), instante = new Date()): Promise<ResultadoRodada> {
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
      prazoHora: tarefas.prazoHora,
      serieRecorrenteId: tarefas.serieRecorrenteId,
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
  const porId = new Map(lista.map((t) => [t.id, t]));
  for (const t of lista) {
    if (t.serieRecorrenteId && (!t.prazo || !vencimentoAtingido(t.prazo, t.prazoHora, instante))) continue;
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
        texto: `${nome}, lembrete: *${t.titulo}* vence amanhã${t.prazoHora ? ` às ${formatarHora(t.prazoHora)}` : ""}.`,
      });
    }

    // Bloqueada não recebe cobrança de atraso: o bloqueio já está registrado.
    // Com hora, já cobra no próprio dia depois do horário (o n8n roda de hora em hora).
    const venceuHoje = dif === 0 && Boolean(t.prazoHora) && agora >= t.prazoHora!;
    if ((dif < 0 || venceuHoje) && t.estado !== "bloqueada") {
      const atraso = venceuHoje ? `hoje às ${formatarHora(t.prazoHora!)}` : dif === -1 ? "ontem" : `há ${-dif} dias`;
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
    const original = c.tarefaId ? porId.get(c.tarefaId) : undefined;
    const r = original?.serieRecorrenteId
      ? await banco.transaction(async (tx) => {
        const [atual] = await tx.select().from(tarefas).where(eq(tarefas.id, original.id)).for("update").limit(1);
        if (!atual || atual.prazo !== original.prazo || atual.prazoHora !== original.prazoHora ||
            atual.estado !== original.estado || atual.responsavelId !== original.responsavelId ||
            atual.titulo !== original.titulo || atual.criadorId !== original.criadorId) return null;
        return enfileirar(tx, c, hoje);
      })
      : await enfileirar(banco, c, hoje);
    if (!r) continue;
    if (!r.inserida) resultado.jaExistiam++;
    else if (r.status === "ignorado") resultado.ignoradas++;
    else resultado.novas++;
  }
  return resultado;
}

// D3 — resumo diário: uma mensagem por pessoa, de manhã, com o que está com
// ela e o que ela pediu e atrasou. Quem não tem nada em aberto não recebe.
// O n8n chama POST /api/n8n/resumo uma vez por dia (ex.: 8h).
export async function gerarResumoDiario(banco: Banco, hoje = hojeISO()): Promise<ResultadoRodada> {
  const config = await lerConfig(banco);
  const resultado: ResultadoRodada = { novas: 0, ignoradas: 0, jaExistiam: 0 };
  if (!config?.ativa) return resultado;

  const [pessoas, abertas] = await Promise.all([
    banco.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.ativo, true)),
    banco
      .select({ responsavelId: tarefas.responsavelId, criadorId: tarefas.criadorId, prazo: tarefas.prazo, estado: tarefas.estado })
      .from(tarefas)
      .where(inArray(tarefas.estado, ["a_fazer", "em_andamento", "em_revisao", "bloqueada"])),
  ]);

  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  for (const p of pessoas) {
    const comEla = abertas.filter((t) => t.responsavelId === p.id);
    const vencidas = comEla.filter((t) => t.prazo && diferencaDias(hoje, t.prazo) < 0).length;
    const hojeOuAmanha = comEla.filter((t) => t.prazo && [0, 1].includes(diferencaDias(hoje, t.prazo))).length;
    const bloqueadas = comEla.filter((t) => t.estado === "bloqueada").length;
    const pediuAtrasadas = abertas.filter((t) => t.criadorId === p.id && t.responsavelId !== p.id && t.prazo && diferencaDias(hoje, t.prazo) < 0).length;
    if (!comEla.length && !pediuAtrasadas) continue;

    const partes = [`${plural(comEla.length, "tarefa", "tarefas")} com você`];
    if (vencidas) partes.push(`*${plural(vencidas, "vencida", "vencidas")}*`);
    if (hojeOuAmanha) partes.push(`${hojeOuAmanha} pra hoje ou amanhã`);
    if (bloqueadas) partes.push(plural(bloqueadas, "bloqueada", "bloqueadas"));
    let texto = `Bom dia, ${primeiroNome(p.nome)}! ${partes.join(", ")}.`;
    if (!comEla.length) texto = `Bom dia, ${primeiroNome(p.nome)}!`;
    if (pediuAtrasadas) texto += ` ${plural(pediuAtrasadas, "pedido seu está atrasado", "pedidos seus estão atrasados")} com outras pessoas.`;
    texto += process.env.SITE_URL ? ` Detalhes: ${process.env.SITE_URL}` : " Detalhes no sistema de gestão.";

    const r = await enfileirar(
      banco,
      { chave: `resumo|${hoje}|${p.id}`, tarefaId: null, regra: "resumo_diario", autorId: null, destinatarioId: p.id, texto },
      hoje
    );
    if (!r.inserida) resultado.jaExistiam++;
    else if (r.status === "ignorado") resultado.ignoradas++;
    else resultado.novas++;
  }
  return resultado;
}
