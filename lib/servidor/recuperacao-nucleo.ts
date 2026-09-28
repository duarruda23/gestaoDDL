import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Banco } from "@/db";
import { convites, eventosAcesso, mensagens, usuarios } from "@/db/schema";
import { gerarToken, hashDoToken } from "./sessao-nucleo";
import { normalizarEmail } from "./login-nucleo";
import { normalizarTelefone } from "./n8n-nucleo";
import { primeiroNome } from "./fila";

// "Esqueci minha senha": a própria pessoa pede, e o link de redefinição vai
// pro WhatsApp cadastrado na conta (nunca aparece na tela). Reusa o convite
// de "redefinir senha" (uso único, só o hash no banco), com validade curta.
// - A resposta é sempre a mesma, exista ou não a conta (não revela e-mails).
// - 3 pedidos por hora por e-mail e 10 por IP; acima disso, não gera nada.
// - Um pedido novo invalida os links anteriores ainda não usados.
// - A mensagem ignora pausa de cobranças, limite diário e janela de silêncio:
//   é a pessoa pedindo, na hora, pra conseguir entrar.

export const VALIDADE_REDEFINICAO_MS = 60 * 60 * 1000;
export const MAX_PEDIDOS_POR_EMAIL = 3;
export const MAX_PEDIDOS_POR_IP = 10;
const JANELA_PEDIDOS_MS = 60 * 60 * 1000;

export type ResultadoPedido = "enviado" | "sem_conta" | "sem_whatsapp" | "limite";

async function pedidosRecentes(banco: Banco, campo: "email" | "ip", valor: string, agora: Date): Promise<number> {
  const desde = new Date(agora.getTime() - JANELA_PEDIDOS_MS);
  const [linha] = await banco
    .select({ n: sql<number>`count(*)::int` })
    .from(eventosAcesso)
    .where(
      and(
        eq(eventosAcesso.tipo, "redefinicao_pedida"),
        gt(eventosAcesso.criadoEm, desde),
        sql`${eventosAcesso.detalhes} ->> ${campo} = ${valor}`
      )
    );
  return linha?.n ?? 0;
}

// Devolve o que aconteceu só para teste e auditoria; a tela mostra sempre a
// mesma mensagem.
export async function pedirRedefinicao(
  banco: Banco,
  entrada: { email: string; ip: string; site: string },
  agora = new Date()
): Promise<ResultadoPedido> {
  const email = normalizarEmail(entrada.email).slice(0, 200);
  const ip = entrada.ip || "desconhecido";

  const [porEmail, porIp] = await Promise.all([
    pedidosRecentes(banco, "email", email, agora),
    pedidosRecentes(banco, "ip", ip, agora),
  ]);
  if (porEmail >= MAX_PEDIDOS_POR_EMAIL || porIp >= MAX_PEDIDOS_POR_IP) return "limite";

  return banco.transaction(async (tx) => {
    const [conta] = await tx.select().from(usuarios).where(sql`lower(${usuarios.email}) = ${email}`).limit(1);
    const telefone = conta ? normalizarTelefone(conta.telefoneWhatsapp) : "";
    const resultado: ResultadoPedido = !conta || !conta.ativo ? "sem_conta" : !telefone ? "sem_whatsapp" : "enviado";

    await tx.insert(eventosAcesso).values({
      tipo: "redefinicao_pedida",
      atorId: null,
      alvoId: conta?.id ?? null,
      detalhes: { email, ip, resultado },
      criadoEm: agora,
    });
    if (resultado !== "enviado" || !conta) return resultado;

    // Links anteriores ainda não usados deixam de valer.
    await tx
      .update(convites)
      .set({ expiraEm: agora })
      .where(and(sql`lower(${convites.email}) = ${email}`, isNull(convites.usadoEm), gt(convites.expiraEm, agora)));

    const token = gerarToken();
    const [convite] = await tx
      .insert(convites)
      .values({
        tokenHash: hashDoToken(token),
        nome: conta.nome,
        email,
        telefoneWhatsapp: conta.telefoneWhatsapp,
        criadoPorId: conta.id,
        criadoEm: agora,
        expiraEm: new Date(agora.getTime() + VALIDADE_REDEFINICAO_MS),
      })
      .returning({ id: convites.id });

    const link = `${entrada.site.replace(/\/$/, "")}/convite/${token}`;
    await tx.insert(mensagens).values({
      chave: `redefinir_senha:${convite.id}`,
      tarefaId: null,
      regra: "redefinir_senha",
      autorId: null,
      destinatarioId: conta.id,
      texto:
        `${primeiroNome(conta.nome)}, recebemos um pedido pra redefinir sua senha do sistema de gestão Donas de Loja. ` +
        `Crie a nova senha neste link (vale 1 hora, uso único): ${link}\n\n` +
        `Se não foi você, é só ignorar: sua senha atual continua valendo.`,
      status: "pendente",
      agendadaPara: agora,
      criadoEm: agora,
    });
    return resultado;
  });
}
