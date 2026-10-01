import { obterBanco } from "@/db";
import { autorizarN8n } from "@/lib/servidor/n8n-auth";
import { gerarResumoDiario } from "@/lib/servidor/regras-cobranca";

// Resumo da manhã: o n8n chama uma vez por dia (ex.: 8h). Repetir no mesmo
// dia não duplica.
export async function POST(req: Request) {
  const negado = autorizarN8n(req);
  if (negado) return negado;
  return Response.json(await gerarResumoDiario(obterBanco()));
}
