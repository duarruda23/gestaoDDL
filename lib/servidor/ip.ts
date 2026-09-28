import "server-only";
import { headers } from "next/headers";

// IP de quem fez a requisição. Na VPS o Traefik coloca o IP real no
// X-Forwarded-For (o primeiro da lista).
export async function ipDaRequisicao(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}
