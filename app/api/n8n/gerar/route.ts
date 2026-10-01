import { obterBanco } from "@/db";
import { autorizarN8n } from "@/lib/servidor/n8n-auth";
import { gerarCobrancasAutomaticas } from "@/lib/servidor/regras-cobranca";
import { apagarTextosVencidos } from "@/lib/servidor/pedidos-nucleo";
import { materializarRecorrencias } from "@/lib/servidor/materializar-recorrencias";
import { dataHoraRecife } from "@/lib/recorrencia/calendario";

// O n8n chama em horário comercial (ex.: de hora em hora). Idempotente:
// no mesmo dia, rodar de novo não duplica mensagem.
export async function POST(req: Request) {
  const negado = autorizarN8n(req);
  if (negado) return negado;
  const banco = obterBanco();
  const agora = new Date();
  const local = dataHoraRecife(agora);
  let recorrencias;
  try {
    recorrencias = await materializarRecorrencias(banco, agora);
  } catch (erro) {
    recorrencias = { resultados: [], falhas: [{ serieId: "job", erro: erro instanceof Error ? erro.message : "Falha desconhecida" }] };
  }
  const cobrancas = await gerarCobrancasAutomaticas(banco, local.data, local.hora.slice(0, 5), agora);
  // Aproveita a rotina diária para aplicar a retenção do texto livre dos pedidos.
  const textosApagados = await apagarTextosVencidos(banco);
  return Response.json({ ...cobrancas, textosApagados, recorrencias }, { status: recorrencias.falhas.length ? 207 : 200 });
}
