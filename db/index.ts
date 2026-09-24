import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Conexão do servidor com o Postgres (Fase 5 em diante). Nunca importar em
// componente de cliente: o "server-only" quebra o build se isso acontecer.
// DATABASE_URL usa o usuário da aplicação, sem privilégio de superusuário.

const globalParaPool = globalThis as unknown as { poolGestao?: Pool };

function criarPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  return new Pool({
    connectionString: url,
    max: 10,
    // Na VPS o app fala com o Postgres pela rede interna do Docker (sem SSL).
    // Se um dia o banco ficar fora da rede interna, exigir SSL aqui.
    ssl: process.env.DATABASE_SSL === "sim" ? { rejectUnauthorized: true } : undefined,
  });
}

// Reaproveita o pool entre recarregamentos do servidor de desenvolvimento.
export const pool = globalParaPool.poolGestao ?? criarPool();
if (process.env.NODE_ENV !== "production") globalParaPool.poolGestao = pool;

export const db = drizzle(pool, { schema });
