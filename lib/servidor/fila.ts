import { and, eq, ne, sql } from "drizzle-orm";
import type { Banco } from "@/db";
import { configCobranca, mensagens, usuarios } from "@/db/schema";
import { FUSO, hojeISO } from "@/lib/datas";

// Fila de saída do WhatsApp (outbox). Toda mensagem nasce aqui, na mesma
// transação do que a causou; quem envia é o n8n. A chave única
// (tarefa + regra + janela + destinatário) faz repetir não duplicar.

type Tx = Parameters<Parameters<Banco["transaction"]>[0]>[0];
type Regra = (typeof mensagens.$inferInsert)["regra"];

export interface NovaMensagem {
  chave: string;
  tarefaId: string | null;
  regra: Regra;
  autorId: string | null;
  destinatarioId: string;
  texto: string;
}

export const primeiroNome = (nome: string) => nome.split(" ")[0];

// Mensagens do dia (em São Paulo) que contam para o limite de quem recebe.
export async function mensagensDoDia(tx: Tx | Banco, destinatarioId: string, hoje = hojeISO()): Promise<number> {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(mensagens)
    .where(
      and(
        eq(mensagens.destinatarioId, destinatarioId),
        ne(mensagens.status, "ignorado"),
        sql`(${mensagens.criadoEm} AT TIME ZONE ${FUSO})::date = ${hoje}::date`
      )
    );
  return n;
}

export async function lerConfig(tx: Tx | Banco) {
  const [c] = await tx.select().from(configCobranca).limit(1);
  return c;
}

// Grava na fila. Quem perdeu o acesso não recebe nada (nem registro);
// pausada, sem WhatsApp ou acima do limite do dia fica registrada como
// "ignorado", com o motivo, para ninguém achar que foi enviada.
export async function enfileirar(
  tx: Tx | Banco,
  m: NovaMensagem,
  hoje = hojeISO()
): Promise<{ inserida: boolean; status: "pendente" | "ignorado" | null }> {
  const [dest] = await tx.select().from(usuarios).where(eq(usuarios.id, m.destinatarioId)).limit(1);
  if (!dest?.ativo) return { inserida: false, status: null };

  let motivo: string | null = null;
  if (dest.cobrancaPausada) motivo = `${primeiroNome(dest.nome)} pausou as cobranças no WhatsApp.`;
  else if (!dest.telefoneWhatsapp.trim()) motivo = `${primeiroNome(dest.nome)} ainda não cadastrou o WhatsApp.`;
  else {
    const config = await lerConfig(tx);
    if (config && (await mensagensDoDia(tx, dest.id, hoje)) >= config.limiteDiarioPorPessoa)
      motivo = `Limite de ${config.limiteDiarioPorPessoa} mensagens por dia para ${primeiroNome(dest.nome)}.`;
  }
  const status = motivo ? "ignorado" : "pendente";

  const r = await tx
    .insert(mensagens)
    .values({ ...m, status, motivo })
    .onConflictDoNothing()
    .returning({ id: mensagens.id });
  return { inserida: r.length > 0, status: r.length ? status : null };
}
