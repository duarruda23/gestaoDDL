// Tipos no mesmo formato das tabelas da seção 8 do spec
// (gestao-donas-de-loja-spec.md). Quando o protótipo virar sistema, estes
// tipos viram o schema Drizzle do Postgres sem redesenhar nada.

export type Estado =
  | "triagem"
  | "a_fazer"
  | "em_andamento"
  | "em_revisao"
  | "bloqueada"
  | "concluida"
  | "arquivada";

export type Prioridade = "baixa" | "media" | "alta" | "urgente";

export type Origem = "manual" | "ia";

// Modelo horizontal: não há papéis. Toda conta pode pedir, atribuir, cobrar
// e ser cobrada — inclusive o Ítalo.
// Única exceção (decisão de 24/09): remover o acesso de alguém. Só o Ítalo
// (dono, fixo) e quem ele autorizar (gerenciaAcessos) podem fazer isso.
export interface Usuario {
  id: string;
  nome: string;
  funcao: string;
  telefone: string;
  frenteIds: string[];
  cobrancaPausada: boolean;
  criadoEm: string;
  criadoPorId: string | null;
  ativo: boolean;
  gerenciaAcessos: boolean;
  acessoRemovidoEm: string | null;
  acessoRemovidoPorId: string | null;
}

export interface Frente {
  id: string;
  nome: string;
  liderId: string | null;
  usaRevisao: boolean;
}

export interface ChecklistItem {
  id: string;
  texto: string;
  concluido: boolean;
}

export interface Comentario {
  id: string;
  autorId: string;
  texto: string;
  criadoEm: string;
}

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string;
  frenteId: string | null;
  responsavelId: string | null;
  envolvidosIds: string[];
  criadorId: string;
  estado: Estado;
  estadoAnterior: Estado | null;
  motivoBloqueio: string | null;
  prioridade: Prioridade;
  prazo: string | null; // YYYY-MM-DD
  origem: Origem;
  versao: number;
  checklist: ChecklistItem[];
  comentarios: Comentario[];
  criadoEm: string;
  atualizadoEm: string;
}

export type TipoEvento =
  | "criada"
  | "estado"
  | "responsavel"
  | "prazo"
  | "prioridade"
  | "comentario"
  | "checklist"
  | "confirmada_ia"
  | "cobranca"
  | "acesso";

export interface EventoTarefa {
  id: string;
  tarefaId: string;
  tipo: TipoEvento;
  atorId: string;
  antes: string | null;
  depois: string | null;
  criadoEm: string;
}

// ---- Entrada inteligente (intake_requests / ai_proposals) ----

export interface Evidencia {
  campo: string;
  trecho: string;
}

export interface Proposta {
  id: string;
  titulo: string;
  descricao: string;
  frenteId: string | null;
  responsavelId: string | null;
  envolvidosIds: string[];
  prazo: string | null;
  prioridade: Prioridade;
  subtarefas: string[];
  evidencias: Evidencia[];
  inferidos: string[];
  ambiguidades: string[];
}

export interface ResultadoInterpretacao {
  modo: "ia" | "simulado";
  modelo: string | null;
  versaoPrompt: string;
  propostas: Proposta[];
  aviso?: string;
}

export interface PedidoEntrada {
  id: string;
  autorId: string;
  texto: string;
  modo: "ia" | "simulado";
  modelo: string | null;
  versaoPrompt: string;
  criadoEm: string;
  propostasConfirmadas: number;
  propostasDescartadas: number;
}

// ---- Cobranças (notification_rules / notification_outbox) ----

export type RegraCobranca =
  | "atribuicao"
  | "prazo_proximo"
  | "vencida"
  | "escalonamento"
  | "cobranca_manual"
  | "resumo_diario";

export type StatusEnvio = "pendente" | "enviado" | "falhou" | "ignorado";

export interface Mensagem {
  id: string;
  chave: string; // tarefa + regra + janela + destinatário (idempotência)
  tarefaId: string | null;
  regra: RegraCobranca;
  autorId: string | null; // quem cobrou (null = automática)
  destinatarioId: string;
  texto: string;
  status: StatusEnvio;
  motivo: string | null;
  tentativas: number;
  criadoEm: string;
}
