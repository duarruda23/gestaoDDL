// Aplica as migrações de ./drizzle na VPS, antes do app subir.
// Usa MIGRACAO_DATABASE_URL (usuário admin), nunca o usuário da aplicação.
// Aplicar de novo é seguro: o Drizzle registra o que já rodou.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.MIGRACAO_DATABASE_URL;
if (!url) {
  console.error("MIGRACAO_DATABASE_URL não configurada.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrações aplicadas.");
} catch (erro) {
  console.error("Falha ao aplicar migrações:", erro);
  process.exitCode = 1;
} finally {
  await pool.end();
}
