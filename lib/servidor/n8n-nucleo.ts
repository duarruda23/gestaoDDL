import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Banco } from "@/db";
import { mensagens, tarefas, usuarios } from "@/db/schema";
import { FUSO } from "@/lib/datas";
import { dataHoraRecife } from "@/lib/recorrencia/calendario";
import { lerConfig, primeiroNome } from "./fila";

// C2 — o que o n8n pode fazer, e só isso (spec, seção 7: operações
// limitadas em vez de acesso ao banco). O ciclo de uma mensagem:
//
//   pendente --reservar--> enviando --resultado ok--> enviado
//                            |  \--resultado erro--> pendente (de novo, mais tarde)
//                            |                       ou falhou (na 3ª tentativa)
//                            \--reserva venceu sem resposta--> volta a ser reservável
//
// A reserva (reservada_ate) impede que duas execuções do n8n peguem a mesma
// mensagem; FOR UPDATE SKIP LOCKED faz o mesmo entre transações simultâneas.

export const MAX_TENTATIVAS = 3;
const RESERVA_MS = 5 * 60_000;

export interface MensagemParaEnviar {
  id: string;
  telefone: string; // só dígitos, com DDI (ex.: 5581999990000)
  nome: string;
  texto: string;
}

export function normalizarTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`; // sem DDI: Brasil
  return d;
}

function horaEmSP(agora: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(agora)) % 24;
}

export async function reservarMensagens(
  banco: Banco,
  limite = 20,
  agora = new Date()
): Promise<{ mensagens: MensagemParaEnviar[]; motivo?: string }> {
  const config = await lerConfig(banco);
  const hora = horaEmSP(agora);
  const local = dataHoraRecife(agora);
  // Janela de silêncio vale para todas as cobranças, inclusive a manual: quem
  // cobra às 23h tem a mensagem entregue de manhã. A única exceção é o link de
  // redefinição de senha, que a própria pessoa pediu agora: sai a qualquer
  // hora, mesmo com as cobranças desligadas.
  const motivoParado = !config?.ativa
    ? "Cobranças desligadas na configuração."
    : hora < config.janelaInicio || hora >= config.janelaFim
      ? `Fora da janela de envio (${config.janelaInicio}h às ${config.janelaFim}h).`
      : null;

  const r = await banco.transaction(async (tx) => {
    const candidatas = await tx
      .select({
        id: mensagens.id,
        texto: mensagens.texto,
        status: mensagens.status,
        regra: mensagens.regra,
        tentativas: mensagens.tentativas,
        nome: usuarios.nome,
        telefone: usuarios.telefoneWhatsapp,
        ativo: usuarios.ativo,
        pausada: usuarios.cobrancaPausada,
      })
      .from(mensagens)
      .innerJoin(usuarios, eq(usuarios.id, mensagens.destinatarioId))
      .leftJoin(tarefas, eq(tarefas.id, mensagens.tarefaId))
      .where(
        and(
          or(
            and(eq(mensagens.status, "pendente"), lte(mensagens.agendadaPara, agora)),
            and(eq(mensagens.status, "enviando"), lt(mensagens.reservadaAte, agora))
          ),
          motivoParado ? eq(mensagens.regra, "redefinir_senha") : undefined,
          or(
            isNull(tarefas.serieRecorrenteId),
            lt(tarefas.dataProgramadaLocal, local.data),
            and(
              eq(tarefas.dataProgramadaLocal, local.data),
              sql`${tarefas.prazoHora} IS NOT NULL AND ${tarefas.prazoHora}::time <= ${local.hora}::time`
            )
          )
        )
      )
      .orderBy(asc(mensagens.agendadaPara))
      .limit(Math.min(Math.max(limite, 1), 100))
      .for("update", { of: mensagens, skipLocked: true });

    const saida: MensagemParaEnviar[] = [];
    for (const c of candidatas) {
      // A situação de quem recebe pode ter mudado desde que a mensagem entrou na fila.
      const motivo = !c.ativo
        ? "Essa pessoa não tem mais acesso ao sistema."
        : c.pausada && c.regra !== "redefinir_senha"
          ? `${primeiroNome(c.nome)} pausou as cobranças no WhatsApp.`
          : !normalizarTelefone(c.telefone)
            ? `${primeiroNome(c.nome)} ainda não cadastrou o WhatsApp.`
            : null;
      if (motivo) {
        await tx.update(mensagens).set({ status: "ignorado", motivo, reservadaAte: null }).where(eq(mensagens.id, c.id));
        continue;
      }
      // Reservada antes e o n8n nunca respondeu: conta como tentativa perdida.
      if (c.status === "enviando" && c.tentativas >= MAX_TENTATIVAS) {
        await tx
          .update(mensagens)
          .set({ status: "falhou", motivo: "O envio não confirmou depois de 3 tentativas.", reservadaAte: null })
          .where(eq(mensagens.id, c.id));
        continue;
      }
      await tx
        .update(mensagens)
        .set({ status: "enviando", reservadaAte: new Date(agora.getTime() + RESERVA_MS), tentativas: c.tentativas + 1 })
        .where(eq(mensagens.id, c.id));
      saida.push({ id: c.id, telefone: normalizarTelefone(c.telefone), nome: c.nome, texto: c.texto });
    }
    return saida;
  });
  return motivoParado && r.length === 0 ? { mensagens: [], motivo: motivoParado } : { mensagens: r };
}

export type Retorno = { ok: true; status: string } | { ok: false; motivo: string };

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function registrarResultado(
  banco: Banco,
  r: { id: string; ok: boolean; idProvedor?: string | null; erro?: string | null },
  agora = new Date()
): Promise<Retorno> {
  if (!FORMATO_UUID.test(r.id)) return { ok: false, motivo: "Mensagem não encontrada." };
  return banco.transaction(async (tx) => {
    const [m] = await tx.select().from(mensagens).where(eq(mensagens.id, r.id)).for("update").limit(1);
    if (!m) return { ok: false, motivo: "Mensagem não encontrada." };
    // Repetir o mesmo resultado não muda nada (o n8n pode reenviar a chamada).
    if (m.status === "enviado") return { ok: true, status: "enviado" };
    if (m.status !== "enviando") return { ok: false, motivo: `A mensagem está "${m.status}", não reservada para envio.` };

    const idProvedor = r.idProvedor ? String(r.idProvedor).slice(0, 200) : null;
    if (r.ok) {
      // Enviado o link de redefinição, ele sai do banco: o token só existe no WhatsApp da pessoa.
      const texto = m.regra === "redefinir_senha" ? "[link de redefinição de senha enviado; apagado do sistema]" : m.texto;
      await tx
        .update(mensagens)
        .set({ status: "enviado", enviadaEm: agora, idProvedor, motivo: null, reservadaAte: null, texto })
        .where(eq(mensagens.id, m.id));
      return { ok: true, status: "enviado" };
    }
    const erro = (r.erro ? String(r.erro) : "Erro no envio.").slice(0, 300);
    if (m.tentativas >= MAX_TENTATIVAS) {
      await tx.update(mensagens).set({ status: "falhou", motivo: erro, reservadaAte: null }).where(eq(mensagens.id, m.id));
      return { ok: true, status: "falhou" };
    }
    // Tenta de novo mais tarde: 5 min depois da 1ª falha, 10 depois da 2ª.
    await tx
      .update(mensagens)
      .set({ status: "pendente", motivo: erro, reservadaAte: null, agendadaPara: new Date(agora.getTime() + m.tentativas * 5 * 60_000) })
      .where(eq(mensagens.id, m.id));
    return { ok: true, status: "pendente" };
  });
}

// C4 — qualquer pessoa pode mandar uma mensagem que falhou de volta pra fila.
export async function reenviarMensagem(banco: Banco, id: string, agora = new Date()): Promise<Retorno> {
  if (!FORMATO_UUID.test(id)) return { ok: false, motivo: "Mensagem não encontrada." };
  const r = await banco
    .update(mensagens)
    .set({ status: "pendente", tentativas: 0, motivo: null, agendadaPara: agora, reservadaAte: null })
    .where(and(eq(mensagens.id, id), eq(mensagens.status, "falhou")))
    .returning({ id: mensagens.id });
  return r.length ? { ok: true, status: "pendente" } : { ok: false, motivo: "Só dá pra reenviar mensagem que falhou." };
}
