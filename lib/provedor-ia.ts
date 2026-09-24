import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { RespostaSchema, type RespostaIA } from "./interpretacao";

// Qual IA interpreta o texto livre. Decidido pela variável de ambiente
// presente no servidor, nessa ordem:
//   1. IA_PROVEDOR=openai|anthropic força um provedor, se a chave dele existir;
//   2. senão, OPENAI_API_KEY → OpenAI (usado nos testes de setembro/2026);
//   3. senão, ANTHROPIC_API_KEY → Anthropic (decisão do spec para produção);
//   4. sem chave nenhuma → interpretação por regras (sem IA).
// Trocar de provedor é só trocar a variável na Vercel/VPS; nenhum código muda.

export type Provedor = "openai" | "anthropic";

export interface ProvedorIA {
  provedor: Provedor;
  modelo: string;
  interpretar: (system: string, texto: string) => Promise<RespostaIA>;
  descreverErro: (erro: unknown) => string;
}

const MODELO_OPENAI = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const MODELO_ANTHROPIC = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

function openai(): ProvedorIA {
  return {
    provedor: "openai",
    modelo: MODELO_OPENAI,
    async interpretar(system, texto) {
      const client = new OpenAI();
      const resposta = await client.responses.parse({
        model: MODELO_OPENAI,
        instructions: system,
        input: texto,
        text: { format: zodTextFormat(RespostaSchema, "propostas_de_tarefa") },
      });
      if (resposta.status === "incomplete") throw new Error("A IA não devolveu uma resposta completa.");
      if (!resposta.output_parsed) throw new Error("A IA recusou ou não conseguiu interpretar esse pedido.");
      return resposta.output_parsed;
    },
    descreverErro(erro) {
      if (erro instanceof OpenAI.AuthenticationError) return "Chave da OpenAI inválida.";
      if (erro instanceof OpenAI.RateLimitError) return "Limite ou saldo da OpenAI esgotado.";
      if (erro instanceof OpenAI.APIConnectionError) return "Sem conexão com a OpenAI.";
      if (erro instanceof OpenAI.APIError) return `Erro da OpenAI (${erro.status ?? "sem status"}).`;
      if (erro instanceof Error) return erro.message;
      return "Erro desconhecido na IA.";
    },
  };
}

function anthropic(): ProvedorIA {
  return {
    provedor: "anthropic",
    modelo: MODELO_ANTHROPIC,
    async interpretar(system, texto) {
      const client = new Anthropic();
      const resposta = await client.messages.parse({
        model: MODELO_ANTHROPIC,
        max_tokens: 16000,
        output_config: { effort: "medium", format: zodOutputFormat(RespostaSchema) },
        system,
        messages: [{ role: "user", content: texto }],
      });
      if (resposta.stop_reason === "refusal") throw new Error("A IA recusou interpretar esse pedido.");
      if (resposta.stop_reason === "max_tokens" || !resposta.parsed_output) {
        throw new Error("A IA não devolveu uma resposta completa.");
      }
      return resposta.parsed_output;
    },
    descreverErro(erro) {
      if (erro instanceof Anthropic.AuthenticationError) return "Chave da Anthropic inválida.";
      if (erro instanceof Anthropic.RateLimitError) return "Limite de uso da Anthropic atingido.";
      if (erro instanceof Anthropic.APIConnectionError) return "Sem conexão com a Anthropic.";
      if (erro instanceof Anthropic.APIError) return `Erro da Anthropic (${erro.status ?? "sem status"}).`;
      if (erro instanceof Error) return erro.message;
      return "Erro desconhecido na IA.";
    },
  };
}

export function escolherProvedor(): ProvedorIA | null {
  const temOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const temAnthropic = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const forcado = process.env.IA_PROVEDOR;
  if (forcado === "anthropic" && temAnthropic) return anthropic();
  if (forcado === "openai" && temOpenAI) return openai();
  if (temOpenAI) return openai();
  if (temAnthropic) return anthropic();
  return null;
}
