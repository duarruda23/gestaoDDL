import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Banco } from "@/db";
import { sessoes, usuarios } from "@/db/schema";

// Núcleo da sessão (A1): tudo que não depende do Next, testável com PGlite.
// O cookie guarda o token; o banco guarda só o hash SHA-256 dele. Vazar a
// tabela sessoes não permite entrar em nenhuma conta.

export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
// Renova a validade no máximo uma vez por hora, para não gravar a cada clique.
const RENOVAR_APOS_MS = 60 * 60 * 1000;

export type ContaDaSessao = typeof usuarios.$inferSelect;

export function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function criarSessao(
  banco: Banco,
  usuarioId: string,
  userAgent: string | null,
  agora = new Date()
): Promise<{ token: string; expiraEm: Date }> {
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + DURACAO_SESSAO_MS);
  await banco.insert(sessoes).values({
    tokenHash: hashDoToken(token),
    usuarioId,
    expiraEm,
    ultimoUsoEm: agora,
    userAgent: userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiraEm };
}

// Devolve a conta dona do token, ou null se o token não existe, venceu ou a
// conta está sem acesso. Renova a validade quando a sessão está em uso.
export async function validarSessao(
  banco: Banco,
  token: string | undefined | null,
  agora = new Date()
): Promise<ContaDaSessao | null> {
  if (!token || token.length > 200) return null;
  const hash = hashDoToken(token);

  const [linha] = await banco
    .select({ conta: usuarios, ultimoUsoEm: sessoes.ultimoUsoEm })
    .from(sessoes)
    .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
    .where(and(eq(sessoes.tokenHash, hash), gt(sessoes.expiraEm, agora)))
    .limit(1);

  if (!linha) return null;
  // Conta sem acesso é tratada como sem sessão. O trigger do banco já apaga
  // as sessões ao remover o acesso; isto é a segunda barreira.
  if (!linha.conta.ativo) return null;

  if (agora.getTime() - linha.ultimoUsoEm.getTime() > RENOVAR_APOS_MS) {
    await banco
      .update(sessoes)
      .set({ ultimoUsoEm: agora, expiraEm: new Date(agora.getTime() + DURACAO_SESSAO_MS) })
      .where(eq(sessoes.tokenHash, hash));
  }
  return linha.conta;
}

export async function encerrarSessao(banco: Banco, token: string | undefined | null): Promise<void> {
  if (!token) return;
  await banco.delete(sessoes).where(eq(sessoes.tokenHash, hashDoToken(token)));
}

export async function encerrarTodasAsSessoes(banco: Banco, usuarioId: string): Promise<void> {
  await banco.delete(sessoes).where(eq(sessoes.usuarioId, usuarioId));
}

// Limpeza de sessões vencidas (chamada de vez em quando, ex.: no login).
export async function apagarSessoesVencidas(banco: Banco, agora = new Date()): Promise<number> {
  const apagadas = await banco.delete(sessoes).where(lt(sessoes.expiraEm, agora)).returning({ t: sessoes.tokenHash });
  return apagadas.length;
}

