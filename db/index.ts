import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

// Conexão do servidor com o Postgres. Nunca importar em componente de
// cliente: o "server-only" quebra o build se isso acontecer.
// DATABASE_URL usa o usuário da aplicação, sem privilégio de superusuário.
// Na VPS o host é "postgres." (com ponto final): ver infra/stack.yml.

// Tipo comum ao node-postgres (produção) e ao PGlite (testes).
export type Banco = PgDatabase<PgQueryResultHKT, typeof schema>;

const global_ = globalThis as unknown as { bancoGestao?: Banco; bancoDeTeste?: Banco };

function criarBanco(): Banco {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const pool = new Pool({
    connectionString: url,
    max: 10,
    // Na VPS o app fala com o Postgres pela rede interna do Docker (sem SSL).
    ssl: process.env.DATABASE_SSL === "sim" ? { rejectUnauthorized: true } : undefined,
  });
  return drizzle(pool, { schema }) as unknown as Banco;
}

// Abre a conexão só no primeiro uso (o build não precisa de banco) e a
// reaproveita entre recarregamentos do servidor de desenvolvimento.
export function obterBanco(): Banco {
  if (global_.bancoDeTeste) return global_.bancoDeTeste;
  global_.bancoGestao ??= criarBanco();
  return global_.bancoGestao;
}

// Só para testes: troca o banco por um PGlite em memória.
export function definirBancoParaTestes(banco: Banco | undefined): void {
  global_.bancoDeTeste = banco;
}
