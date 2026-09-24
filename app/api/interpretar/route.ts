import { FRENTES, USUARIOS } from "@/lib/seed";
import { hojeISO } from "@/lib/datas";
import { VERSAO_PROMPT, montarSystemPrompt, validarPropostas } from "@/lib/interpretacao";
import { escolherProvedor } from "@/lib/provedor-ia";
import { interpretarSimulado } from "@/lib/interpretar-simulado";
import type { ResultadoInterpretacao, Usuario } from "@/lib/types";

// A chave da IA só existe no servidor (seção 8 do spec). Qual IA é usada
// está em lib/provedor-ia.ts. Sem chave, ou se a IA falhar, a rota cai no
// interpretador por regras — criar tarefa nunca depende da IA estar no ar.

const LIMITE_CARACTERES = 4000;

// No protótipo as contas vivem no navegador, então a equipe vem no corpo da
// requisição (só nome, função e frentes). No sistema real ela sai do banco.
function lerEquipe(bruto: unknown): Usuario[] {
  if (!Array.isArray(bruto)) return USUARIOS;
  const equipe = bruto
    .filter((u): u is Record<string, unknown> => typeof u === "object" && u !== null)
    .filter((u) => typeof u.id === "string" && typeof u.nome === "string")
    .slice(0, 100)
    .map((u) => ({
      id: String(u.id).slice(0, 40),
      nome: String(u.nome).slice(0, 60),
      funcao: typeof u.funcao === "string" ? u.funcao.slice(0, 80) : "",
      telefone: "",
      frenteIds: Array.isArray(u.frenteIds) ? u.frenteIds.filter((f): f is string => typeof f === "string").slice(0, 20) : [],
      cobrancaPausada: false,
      criadoEm: "",
      criadoPorId: null,
    }));
  return equipe.length ? equipe : USUARIOS;
}

export async function POST(request: Request) {
  let texto = "";
  let autor: Usuario | null = null;
  let equipe: Usuario[] = USUARIOS;
  try {
    const corpo = (await request.json()) as { texto?: unknown; autorId?: unknown; equipe?: unknown };
    texto = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
    equipe = lerEquipe(corpo.equipe);
    // No protótipo a conta vem do navegador; no sistema real vem da sessão do servidor.
    autor = equipe.find((u) => u.id === corpo.autorId) ?? null;
  } catch {
    return Response.json({ erro: "Corpo inválido." }, { status: 400 });
  }
  if (!texto) return Response.json({ erro: "Escreva o pedido antes de enviar." }, { status: 400 });
  if (texto.length > LIMITE_CARACTERES) {
    return Response.json(
      { erro: `Pedido muito longo (máximo ${LIMITE_CARACTERES} caracteres). Divida em partes.` },
      { status: 400 }
    );
  }

  const hoje = hojeISO();
  const simulado = (aviso?: string): ResultadoInterpretacao => ({
    modo: "simulado",
    modelo: null,
    versaoPrompt: VERSAO_PROMPT,
    propostas: validarPropostas(interpretarSimulado(texto, hoje, equipe, FRENTES), hoje, equipe, FRENTES),
    aviso,
  });

  const ia = escolherProvedor();
  if (!ia) {
    return Response.json(simulado("Nenhuma IA configurada neste ambiente. Interpretação feita por regras simples."));
  }

  try {
    const bruto = await ia.interpretar(montarSystemPrompt(hoje, equipe, FRENTES, autor), texto);
    const resultado: ResultadoInterpretacao = {
      modo: "ia",
      modelo: ia.modelo,
      versaoPrompt: VERSAO_PROMPT,
      propostas: validarPropostas(bruto, hoje, equipe, FRENTES),
    };
    return Response.json(resultado);
  } catch (erro) {
    console.error("[interpretar] falha na IA:", erro);
    return Response.json(
      simulado(`${ia.descreverErro(erro)} Usei a interpretação por regras; revise com atenção.`)
    );
  }
}
