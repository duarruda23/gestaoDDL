import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Banco } from "@/db";

// Postgres de verdade em memória (PGlite), com as mesmas migrações da
// produção — inclusive os triggers de 0001_protecoes.sql.
export async function criarBancoDeTeste(): Promise<{ banco: Banco; pg: PGlite }> {
  const pg = new PGlite();
  const banco = drizzle(pg, { schema });
  await migrate(banco, { migrationsFolder: "./drizzle" });
  return { banco: banco as unknown as Banco, pg };
}

// Esvazia todas as tabelas entre testes (TRUNCATE não dispara os triggers de
// linha que protegem o histórico). O CASCADE também esvazia config_cobranca
// (ela referencia usuarios), então a linha padrão é recolocada no fim.
export async function limparBanco(pg: PGlite): Promise<void> {
  const { rows } = await pg.query<{ nome: string }>(
    "select tablename as nome from pg_tables where schemaname = 'public'"
  );
  await pg.exec(`TRUNCATE ${rows.map((r) => `"${r.nome}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await pg.exec("INSERT INTO config_cobranca (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
}

let contador = 0;
export async function criarConta(
  banco: Banco,
  dados: Partial<typeof schema.usuarios.$inferInsert> = {}
): Promise<typeof schema.usuarios.$inferSelect> {
  contador += 1;
  const [conta] = await banco
    .insert(schema.usuarios)
    .values({
      nome: `Pessoa ${contador}`,
      email: `pessoa${contador}@exemplo.com`,
      telefoneWhatsapp: `+55 82 90000-${String(contador).padStart(4, "0")}`,
      ...dados,
    })
    .returning();
  return conta;
}
