import { and, eq, isNull, sql } from "drizzle-orm";
import type { Banco } from "@/db";
import { convites, eventosAcesso, sessoes, usuarios } from "@/db/schema";
import { gerarToken, hashDoToken } from "./sessao-nucleo";
import { gerarHashDeSenha, problemaNaSenha } from "./senha";
import { normalizarEmail } from "./login-nucleo";
import { podeGerenciarAcessos } from "./permissoes";

// Convites (A3/A4): link de uso único, válido por 72h. O banco guarda só o
// hash do token. Dois tipos:
//  - conta nova: e-mail que ainda não existe; qualquer pessoa da equipe cria;
//  - redefinir senha: e-mail de uma conta que já existe; SÓ o dono e quem
//    ele autorizar criam (senão qualquer um tomaria a conta de outra pessoa).

export const VALIDADE_CONVITE_MS = 72 * 60 * 60 * 1000;

type Conta = typeof usuarios.$inferSelect;
export type SituacaoConvite = "valido" | "usado" | "vencido" | "inexistente";

export type ResultadoCriarConvite =
  | { ok: true; token: string; conviteId: string; expiraEm: Date; tipo: "conta_nova" | "redefinir_senha" }
  | { ok: false; motivo: string };

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

async function contaPorEmail(banco: Banco, email: string): Promise<Conta | undefined> {
  const [conta] = await banco.select().from(usuarios).where(sql`lower(${usuarios.email}) = ${email}`).limit(1);
  return conta;
}

export async function criarConvite(
  banco: Banco,
  criador: Conta,
  dados: { nome: string; email: string; telefoneWhatsapp: string },
  agora = new Date()
): Promise<ResultadoCriarConvite> {
  if (!criador.ativo) return { ok: false, motivo: "Sua conta está sem acesso." };
  const nome = dados.nome.trim();
  const email = normalizarEmail(dados.email);
  const telefone = dados.telefoneWhatsapp.trim();
  if (!nome) return { ok: false, motivo: "Informe o nome." };
  if (!emailValido(email)) return { ok: false, motivo: "Informe um e-mail válido." };
  if (!/^\+?[\d\s()-]{10,}$/.test(telefone)) return { ok: false, motivo: "Informe o WhatsApp com DDD." };

  const existente = await contaPorEmail(banco, email);
  const tipo = existente ? "redefinir_senha" : "conta_nova";
  if (existente && !podeGerenciarAcessos(criador)) {
    return { ok: false, motivo: "Já existe uma conta com esse e-mail. Para redefinir a senha, peça ao Ítalo." };
  }
  if (existente && !existente.ativo) {
    return { ok: false, motivo: "Essa conta está sem acesso. Restaure o acesso antes de mandar um convite." };
  }

  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + VALIDADE_CONVITE_MS);
  const [convite] = await banco
    .insert(convites)
    .values({ tokenHash: hashDoToken(token), nome, email, telefoneWhatsapp: telefone, criadoPorId: criador.id, criadoEm: agora, expiraEm })
    .returning({ id: convites.id });
  await banco.insert(eventosAcesso).values({
    tipo: "convite_criado",
    atorId: criador.id,
    alvoId: existente?.id ?? null,
    detalhes: { conviteId: convite.id, email, tipo },
    criadoEm: agora,
  });
  return { ok: true, token, conviteId: convite.id, expiraEm, tipo };
}

export async function lerConvite(
  banco: Banco,
  token: string,
  agora = new Date()
): Promise<{ situacao: SituacaoConvite; convite?: typeof convites.$inferSelect; contaExistente?: boolean }> {
  if (!token || token.length > 200) return { situacao: "inexistente" };
  const [convite] = await banco.select().from(convites).where(eq(convites.tokenHash, hashDoToken(token))).limit(1);
  if (!convite) return { situacao: "inexistente" };
  if (convite.usadoEm) return { situacao: "usado", convite };
  if (convite.expiraEm.getTime() <= agora.getTime()) return { situacao: "vencido", convite };
  const contaExistente = convite.email ? Boolean(await contaPorEmail(banco, convite.email)) : false;
  return { situacao: "valido", convite, contaExistente };
}

export type ResultadoAceitar = { ok: true; usuarioId: string } | { ok: false; motivo: string };

export async function aceitarConvite(
  banco: Banco,
  token: string,
  senha: string,
  agora = new Date()
): Promise<ResultadoAceitar> {
  const problema = problemaNaSenha(senha);
  if (problema) return { ok: false, motivo: problema };
  const senhaHash = await gerarHashDeSenha(senha);

  return banco.transaction(async (tx) => {
    const hash = hashDoToken(token);
    const [convite] = await tx
      .select()
      .from(convites)
      .where(and(eq(convites.tokenHash, hash), isNull(convites.usadoEm), sql`${convites.expiraEm} > ${agora}`))
      .limit(1);
    if (!convite) return { ok: false as const, motivo: "Este convite já foi usado ou venceu. Peça um novo." };
    const email = normalizarEmail(convite.email ?? "");
    const [existente] = await tx.select().from(usuarios).where(sql`lower(${usuarios.email}) = ${email}`).limit(1);
    if (existente && !existente.ativo) {
      return { ok: false as const, motivo: "Esta conta está sem acesso. Fale com o Ítalo." };
    }

    // "Reserva" o convite de forma atômica: dois cliques ao mesmo tempo não
    // usam o mesmo link duas vezes (o segundo UPDATE não acha a linha livre).
    const reservado = await tx
      .update(convites)
      .set({ usadoEm: agora })
      .where(and(eq(convites.id, convite.id), isNull(convites.usadoEm)))
      .returning({ id: convites.id });
    if (reservado.length === 0) return { ok: false as const, motivo: "Este convite já foi usado. Peça um novo." };

    let usuarioId: string;
    if (existente) {
      // Redefinir senha (ou primeira senha do dono): troca a senha e derruba
      // as sessões antigas.
      await tx.update(usuarios).set({ senhaHash }).where(eq(usuarios.id, existente.id));
      await tx.delete(sessoes).where(eq(sessoes.usuarioId, existente.id));
      usuarioId = existente.id;
    } else {
      const [nova] = await tx
        .insert(usuarios)
        .values({
          nome: convite.nome,
          email,
          senhaHash,
          telefoneWhatsapp: convite.telefoneWhatsapp ?? "",
          criadoPorId: convite.criadoPorId,
          criadoEm: agora,
        })
        .returning({ id: usuarios.id });
      usuarioId = nova.id;
      await tx.insert(eventosAcesso).values({
        tipo: "conta_criada",
        atorId: convite.criadoPorId,
        alvoId: usuarioId,
        detalhes: { conviteId: convite.id },
        criadoEm: agora,
      });
    }
    await tx.update(convites).set({ usadoPorId: usuarioId }).where(eq(convites.id, convite.id));
    return { ok: true as const, usuarioId };
  });
}
