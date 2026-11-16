import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { Leitor } from "@/lib/servidor/campanhas-nucleo";

// Leitura do Supabase "Dashboard-italo" pelo servidor, com a role somente leitura
// `leitura_gestao` (db/dashboard-italo/001-views-funil.sql). A URL fica só no .env
// da VPS (DASHBOARD_ITALO_DATABASE_URL). Nunca importar em componente de cliente.

const global_ = globalThis as unknown as { leitorDashboardItalo?: Leitor; leitorDeTeste?: Leitor };

export function dashboardItaloConfigurado(): boolean {
  return Boolean(global_.leitorDeTeste ?? process.env.DASHBOARD_ITALO_DATABASE_URL);
}

export function obterLeitorDashboardItalo(): Leitor {
  if (global_.leitorDeTeste) return global_.leitorDeTeste;
  if (global_.leitorDashboardItalo) return global_.leitorDashboardItalo;
  const url = process.env.DASHBOARD_ITALO_DATABASE_URL;
  if (!url) throw new Error("DASHBOARD_ITALO_DATABASE_URL não configurada.");
  // Supabase exige TLS. O certificado do pooler é assinado pela "Supabase Root 2021 CA",
  // que não está no repositório de confiança do Node: ela vai junto com o app (db/supabase-ca.pem).
  // A verificação do certificado fica sempre ligada.
  const caArquivo = path.join(process.cwd(), "db", "supabase-ca.pem");
  const pool = new Pool({
    connectionString: url,
    max: 3,
    ssl: { rejectUnauthorized: true, ...(existsSync(caArquivo) ? { ca: readFileSync(caArquivo, "utf8") } : {}) },
    statement_timeout: 15_000,
  });
  global_.leitorDashboardItalo = {
    async consultar<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params);
      return r.rows as T[];
    },
  };
  return global_.leitorDashboardItalo;
}

// Só para testes.
export function definirLeitorParaTestes(leitor: Leitor | undefined): void {
  global_.leitorDeTeste = leitor;
}
