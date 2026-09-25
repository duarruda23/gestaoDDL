import type { Estado, Prioridade } from "./types";

// Formato das tarefas como as telas recebem (serializável: vai do servidor
// para componentes de cliente). Montado em lib/servidor/consultas.ts.

export interface Pessoa {
  id: string;
  nome: string;
}

export interface TarefaVisao {
  id: string;
  titulo: string;
  estado: Estado;
  estadoAnterior: Estado | null;
  prioridade: Prioridade;
  prazo: string | null; // YYYY-MM-DD
  origem: "manual" | "ia";
  motivoBloqueio: string | null;
  responsavel: Pessoa | null;
  criador: Pessoa;
  frente: { id: string; nome: string } | null;
  checklistFeitos: number;
  checklistTotal: number;
  versao: number;
}

export interface EventoVisao {
  id: number;
  tipo: string;
  ator: string;
  antes: string | null;
  depois: string | null;
  criadoEm: string; // ISO
}

export interface TarefaDetalhe extends TarefaVisao {
  descricao: string;
  envolvidos: Pessoa[];
  checklist: { id: string; texto: string; concluido: boolean }[];
  comentarios: { id: string; autor: string; texto: string; criadoEm: string }[];
  eventos: EventoVisao[];
  mensagens: { id: string; regra: string; autor: string | null; destinatario: string; status: string }[];
  frenteUsaRevisao: boolean;
}
