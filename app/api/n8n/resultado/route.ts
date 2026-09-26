import { z } from "zod";
import { obterBanco } from "@/db";
import { autorizarN8n } from "@/lib/servidor/n8n-auth";
import { registrarResultado } from "@/lib/servidor/n8n-nucleo";

// O n8n devolve o resultado de cada envio: um objeto ou { "resultados": [...] }.
const Resultado = z.object({
  id: z.string().max(40),
  ok: z.boolean(),
  idProvedor: z.string().max(200).nullish(),
  erro: z.string().max(1000).nullish(),
});
const Corpo = z.union([Resultado, z.object({ resultados: z.array(Resultado).max(100) })]);

export async function POST(req: Request) {
  const negado = autorizarN8n(req);
  if (negado) return negado;
  const lido = Corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return Response.json({ erro: "Corpo inválido." }, { status: 400 });
  const lista = "resultados" in lido.data ? lido.data.resultados : [lido.data];
  const banco = obterBanco();
  const saida = [];
  for (const r of lista) saida.push({ id: r.id, ...(await registrarResultado(banco, r)) });
  return Response.json({ resultados: saida });
}
