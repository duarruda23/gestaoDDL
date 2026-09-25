import { obterBanco } from "@/db";
import { autorizarN8n } from "@/lib/servidor/n8n-auth";
import { gerarCobrancasAutomaticas } from "@/lib/servidor/regras-cobranca";

// O n8n chama em horário comercial (ex.: de hora em hora). Idempotente:
// no mesmo dia, rodar de novo não duplica mensagem.
export async function POST(req: Request) {
  const negado = autorizarN8n(req);
  if (negado) return negado;
  return Response.json(await gerarCobrancasAutomaticas(obterBanco()));
}
