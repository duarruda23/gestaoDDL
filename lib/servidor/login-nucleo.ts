import { and, eq, gt, sql } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosAcesso, usuarios } from "@/db/schema";
import { conferirSenha, hashDeSenhaFalso } from "./senha";

// Núcleo do login (A2), sem Next, testável com PGlite.
// - Mesma resposta para "e-mail não existe" e "senha errada".
// - 5 falhas em 15 min, por e-mail ou por IP, bloqueiam novas tentativas.
// - Toda tentativa vai para eventos_acesso (auditoria).

export const MAX_FALHAS = 5;
export const JANELA_MS = 15 * 60 * 1000;

export type ResultadoLogin =
  | { ok: true; usuarioId: string }
  | { ok: false; motivo: "credenciais" | "bloqueado" | "sem_acesso" };

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function falhasRecentes(banco: Banco, campo: "email" | "ip", valor: string, agora: Date): Promise<number> {
  const desde = new Date(agora.getTime() - JANELA_MS);
  const [linha] = await banco
    .select({ n: sql<number>`count(*)::int` })
    .from(eventosAcesso)
    .where(
      and(
        eq(eventosAcesso.tipo, "login_falhou"),
        gt(eventosAcesso.criadoEm, desde),
        sql`${eventosAcesso.detalhes} ->> ${campo} = ${valor}`
      )
    );
  return linha?.n ?? 0;
}

export async function tentarEntrar(
  banco: Banco,
  entrada: { email: string; senha: string; ip: string },
  agora = new Date()
): Promise<ResultadoLogin> {
  const email = normalizarEmail(entrada.email);
  const ip = entrada.ip || "desconhecido";

  const [porEmail, porIp] = await Promise.all([
    falhasRecentes(banco, "email", email, agora),
    falhasRecentes(banco, "ip", ip, agora),
  ]);
  if (porEmail >= MAX_FALHAS || porIp >= MAX_FALHAS) {
    return { ok: false, motivo: "bloqueado" };
  }

  const [conta] = await banco
    .select()
    .from(usuarios)
    .where(sql`lower(${usuarios.email}) = ${email}`)
    .limit(1);

  // Sempre roda o scrypt, exista ou não a conta: o tempo de resposta não
  // revela se o e-mail está cadastrado.
  const senhaCerta = await conferirSenha(entrada.senha, conta?.senhaHash ?? (await hashDeSenhaFalso()));

  if (!conta || !senhaCerta) {
    await banco.insert(eventosAcesso).values({
      tipo: "login_falhou",
      alvoId: conta?.id ?? null,
      detalhes: { email, ip },
      criadoEm: agora,
    });
    return { ok: false, motivo: "credenciais" };
  }

  // Senha certa, mas acesso removido: só aqui dá para dizer o motivo,
  // porque quem acertou a senha é a própria pessoa.
  if (!conta.ativo) {
    return { ok: false, motivo: "sem_acesso" };
  }

  await banco.insert(eventosAcesso).values({
    tipo: "login",
    atorId: conta.id,
    alvoId: conta.id,
    detalhes: { ip },
    criadoEm: agora,
  });
  return { ok: true, usuarioId: conta.id };
}

// Para onde voltar depois de entrar. Só caminhos internos: bloqueia
// "//site.com", "/\\site.com" e URLs absolutas (redirecionamento aberto).
export function destinoSeguro(voltar: string | null | undefined): string {
  if (!voltar || !voltar.startsWith("/") || voltar.startsWith("//") || voltar.startsWith("/\\")) return "/";
  if (voltar.startsWith("/entrar")) return "/";
  return voltar;
}
