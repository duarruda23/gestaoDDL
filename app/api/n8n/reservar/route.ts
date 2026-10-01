import { obterBanco } from "@/db";
import { autorizarN8n } from "@/lib/servidor/n8n-auth";
import { reservarMensagens } from "@/lib/servidor/n8n-nucleo";

// Entrega ao n8n as próximas mensagens a enviar, já reservadas por 5 minutos.
// Corpo opcional: { "limite": 20 }.
export async function POST(req: Request) {
  const negado = autorizarN8n(req);
  if (negado) return negado;
  const corpo = await req.json().catch(() => ({}));
  const limite = Number.isInteger(corpo?.limite) ? corpo.limite : 20;
  return Response.json(await reservarMensagens(obterBanco(), limite));
}
