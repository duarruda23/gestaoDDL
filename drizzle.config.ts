import { defineConfig } from "drizzle-kit";

// Migrações geradas a partir de db/schema.ts. Para aplicar:
//   DATABASE_URL=postgres://... pnpm db:migrate
// O usuário da aplicação no Postgres não deve ser superusuário; as migrações
// rodam com outro usuário (ver infra/README.md).
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/gestao_donas" },
  strict: true,
  verbose: true,
});
