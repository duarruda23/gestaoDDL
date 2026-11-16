import "server-only";
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
  const pool = new Pool({
    connectionString: url,
    max: 3,
    ssl: { rejectUnauthorized: true }, // Supabase exige TLS
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
