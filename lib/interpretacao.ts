import { z } from "zod";
import type { Frente, Proposta, Usuario } from "./types";
import { diaSemana, diferencaDias } from "./datas";

// Contrato da saída da IA (seção 6 do spec). A mesma validação roda para a
// resposta do Claude e para o interpretador simulado.

export const VERSAO_PROMPT = "intake-v2-2026-09-24";

export const PropostaSchema = z.object({
  titulo: z.string().describe("Título curto no infinitivo, em português"),
  descricao: z.string().describe("Contexto útil para quem vai executar; vazio se não houver"),
  frente_id: z.string().nullable().describe("ID de uma frente da lista, ou null se não der pra saber"),
  responsavel_id: z.string().nullable().describe("ID da pessoa que EXECUTA a entrega, ou null se não estiver claro"),
  envolvidos_ids: z.array(z.string()).describe("IDs de outras pessoas citadas (quem aprova, quem é cobrado, quem pediu)"),
  prazo: z.string().nullable().describe("Data YYYY-MM-DD no fuso America/Sao_Paulo, ou null se o texto não indicar"),
  prioridade: z.enum(["baixa", "media", "alta", "urgente"]),
  subtarefas: z.array(z.string()).describe("Passos listados no texto; vazio se o texto não listar"),
  evidencias: z
    .array(z.object({ campo: z.string(), trecho: z.string() }))
    .describe("Para cada campo preenchido, o trecho literal do texto que o fundamenta"),
  inferidos: z
    .array(z.string())
    .describe("Nomes dos campos que foram deduzidos, e não ditos explicitamente (ex.: frente_id, responsavel_id, prazo, prioridade)"),
  ambiguidades: z.array(z.string()).describe("Perguntas objetivas sobre o que ficou em aberto"),
});

export const RespostaSchema = z.object({
  propostas: z.array(PropostaSchema),
});

export type RespostaIA = z.infer<typeof RespostaSchema>;

export function montarSystemPrompt(hoje: string, usuarios: Usuario[], frentes: Frente[], autor: Usuario | null): string {
  const pessoas = usuarios
    .map((u) => `- ${u.id}: ${u.nome} — ${u.funcao} (frentes: ${u.frenteIds.join(", ") || "todas/gestão"})`)
    .join("\n");
  const listaFrentes = frentes
    .map((f) => `- ${f.id}: ${f.nome} (pessoa de referência: ${f.liderId ?? "nenhuma"})`)
    .join("\n");

  const quemEscreve = autor ? `${autor.nome} (${autor.id})` : "uma pessoa da equipe";
  return `Você transforma pedidos escritos pela equipe do Donas de Loja (mentoria e eventos para donas de loja de moda) em propostas de tarefas. A equipe é horizontal: qualquer pessoa pede tarefas para qualquer outra, inclusive para o Ítalo, o fundador. Uma pessoa vai revisar cada proposta antes de ela virar tarefa, então é melhor deixar um campo vazio e perguntar do que adivinhar.

Quem está escrevendo este pedido: ${quemEscreve}. "Eu", "pra mim" e "comigo" se referem a essa pessoa.

Hoje é ${diaSemana(hoje)}, ${hoje} (fuso America/Sao_Paulo).

Pessoas da equipe:
${pessoas}

Frentes de trabalho:
${listaFrentes}

Como montar as propostas:
- Uma proposta por entrega distinta. "Grave os vídeos e mande a arte do post" são duas entregas.
- responsavel_id é quem executa. Em "peça à Ana três vídeos", a Ana executa. Quem pede, aprova ou precisa ser avisado vai em envolvidos_ids.
- Só use IDs das listas acima. Se o texto citar alguém que não está na lista, ou não disser quem faz, use null e registre a dúvida em ambiguidades.
- Resolva datas relativas a partir de hoje: "amanhã", "sexta" (a próxima sexta, ou hoje se hoje for sexta), "dia 30" (o próximo dia 30). Expressões vagas como "semana que vem", "logo" ou "quando der" viram prazo null com uma pergunta em ambiguidades.
- Se a frente não for dita mas for óbvia pelo assunto, preencha e marque "frente_id" em inferidos. Se o responsável for deduzido (por exemplo, a pessoa de referência da frente), marque "responsavel_id" em inferidos.
- Prioridade: "urgente" só com sinal explícito (urgente, hoje sem falta, pra ontem); "alta" quando o texto indica pressa; senão "media". Marque "prioridade" em inferidos quando não estiver escrita.
- Em evidencias, copie o trecho literal do pedido que justifica cada campo preenchido.
- Escreva tudo em português do Brasil.`;
}

// Validação no servidor: nenhum ID inexistente ou data inválida passa adiante.
export function validarPropostas(
  resposta: RespostaIA,
  hoje: string,
  usuarios: Usuario[],
  frentes: Frente[]
): Proposta[] {
  const idsUsuarios = new Set(usuarios.map((u) => u.id));
  const idsFrentes = new Set(frentes.map((f) => f.id));

  return resposta.propostas.map((p, i) => {
    const ambiguidades = [...p.ambiguidades];
    let responsavelId = p.responsavel_id;
    if (responsavelId && !idsUsuarios.has(responsavelId)) {
      ambiguidades.push("A IA sugeriu um responsável que não existe no cadastro. Escolha quem executa.");
      responsavelId = null;
    }
    let frenteId = p.frente_id;
    if (frenteId && !idsFrentes.has(frenteId)) {
      ambiguidades.push("Frente sugerida não existe no cadastro. Escolha a frente.");
      frenteId = null;
    }
    let prazo = p.prazo;
    if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) {
      ambiguidades.push(`Prazo "${prazo}" não é uma data válida. Defina a data.`);
      prazo = null;
    } else if (prazo && diferencaDias(hoje, prazo) < 0) {
      ambiguidades.push("O prazo interpretado já passou. Confirme a data.");
    }
    return {
      id: `p-${i}-${Math.random().toString(36).slice(2, 7)}`,
      titulo: p.titulo,
      descricao: p.descricao,
      frenteId,
      responsavelId,
      envolvidosIds: p.envolvidos_ids.filter((id) => idsUsuarios.has(id) && id !== responsavelId),
      prazo,
      prioridade: p.prioridade,
      subtarefas: p.subtarefas,
      evidencias: p.evidencias,
      inferidos: p.inferidos,
      ambiguidades,
    };
  });
}
