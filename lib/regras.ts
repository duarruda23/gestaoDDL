import type {
  Estado,
  Frente,
  Prioridade,
  RegraCobranca,
  Tarefa,
} from "./types";
import { diferencaDias, hojeISO } from "./datas";

export const ROTULO_ESTADO: Record<Estado, string> = {
  triagem: "Triagem",
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  em_revisao: "Em revisão",
  bloqueada: "Bloqueada",
  concluida: "Concluída",
  arquivada: "Arquivada",
};

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const ROTULO_REGRA: Record<RegraCobranca, string> = {
  atribuicao: "Aviso de atribuição",
  prazo_proximo: "Prazo amanhã",
  vencida: "Cobrança de atraso",
  escalonamento: "Aviso a quem pediu",
  cobranca_manual: "Cobrança de colega",
  resumo_diario: "Resumo diário",
};

export const COLUNAS_QUADRO: Estado[] = [
  "triagem",
  "a_fazer",
  "em_andamento",
  "em_revisao",
  "bloqueada",
  "concluida",
];

export const ORDEM_PRIORIDADE: Record<Prioridade, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

// ---- Máquina de estados (seção 4 do spec) ----

export function transicoesPermitidas(t: Tarefa, frente: Frente | undefined): Estado[] {
  const usaRevisao = frente?.usaRevisao ?? false;
  switch (t.estado) {
    case "triagem":
      return ["a_fazer"];
    case "a_fazer":
      return ["em_andamento", "bloqueada"];
    case "em_andamento":
      return usaRevisao
        ? ["em_revisao", "bloqueada", "a_fazer"]
        : ["concluida", "bloqueada", "a_fazer"];
    case "em_revisao":
      return ["concluida", "em_andamento"];
    case "bloqueada":
      return t.estadoAnterior ? [t.estadoAnterior] : ["a_fazer"];
    case "concluida":
      return ["em_andamento"];
    case "arquivada":
      return [];
  }
}

export function rotuloTransicao(de: Estado, para: Estado): string {
  if (de === "bloqueada") return "Desbloquear";
  if (de === "em_revisao" && para === "em_andamento") return "Pedir ajustes";
  if (de === "concluida") return "Reabrir";
  if (de === "triagem") return "Liberar para execução";
  if (para === "a_fazer") return "Voltar para a fazer";
  const mapa: Partial<Record<Estado, string>> = {
    em_andamento: "Começar",
    em_revisao: "Enviar para revisão",
    concluida: "Concluir",
    bloqueada: "Marcar bloqueio",
  };
  return mapa[para] ?? ROTULO_ESTADO[para];
}

// Uma tarefa só sai da triagem com dono e prazo (seção 4, passo 3).
export function pendenciasParaLiberar(t: Tarefa): string[] {
  const faltas: string[] = [];
  if (!t.responsavelId) faltas.push("responsável");
  if (!t.prazo) faltas.push("prazo");
  if (!t.frenteId) faltas.push("frente");
  return faltas;
}

// ---- Permissões ----
// Modelo horizontal (decisão de 24/09): toda conta pode ver, pedir, atribuir,
// editar, mudar etapa e cobrar qualquer tarefa, de qualquer pessoa — o Ítalo
// incluído. O que separa as pessoas é o histórico (quem pediu, quem cobrou),
// não o poder. Por isso não há funções de permissão aqui.

// ---- Situação de prazo ----

export function estaAtiva(t: Tarefa): boolean {
  return t.estado !== "concluida" && t.estado !== "arquivada";
}

export function estaVencida(t: Tarefa, hoje = hojeISO()): boolean {
  return estaAtiva(t) && t.prazo !== null && diferencaDias(hoje, t.prazo) < 0;
}

export function venceEmBreve(t: Tarefa, hoje = hojeISO()): boolean {
  if (!estaAtiva(t) || !t.prazo) return false;
  const dif = diferencaDias(hoje, t.prazo);
  return dif >= 0 && dif <= 1;
}

export function ordenarPorUrgencia(a: Tarefa, b: Tarefa): number {
  const pa = a.prazo ?? "9999-12-31";
  const pb = b.prazo ?? "9999-12-31";
  if (pa !== pb) return pa < pb ? -1 : 1;
  return ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade];
}
