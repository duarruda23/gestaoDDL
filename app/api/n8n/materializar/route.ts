import { obterBanco } from "@/db";
import { autorizarN8n } from "@/lib/servidor/n8n-auth";
import { materializarRecorrencias } from "@/lib/servidor/materializar-recorrencias";

// O n8n apenas aciona a rotina; toda a regra e a transação ficam no backend.
// Este endpoint não envia mensagens.
export async function POST(req: Request) {
  const negado = autorizarN8n(req);
  if (negado) return negado;
  const resultado = await materializarRecorrencias(obterBanco());
  if (resultado.falhas.length) console.error("Falhas ao materializar recorrências", resultado.falhas);
  return Response.json(resultado, { status: resultado.falhas.length ? 500 : 200 });
}
