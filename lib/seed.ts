import type {
  EventoTarefa,
  Frente,
  Mensagem,
  Tarefa,
  Usuario,
} from "./types";
import { hojeISO, somarDias } from "./datas";
import { DONO_ID } from "./regras";

// Dados de demonstração. Ítalo, Eduardo, Scarlett, Larissa e Vitória são da
// operação real; Ana, Bruno, Camila e Diego são exemplos até a equipe real
// ser cadastrada. Modelo horizontal: ninguém tem papel de chefe no sistema.

const CRIACAO = "2026-09-01T12:00:00.000Z";

function conta(
  id: string,
  nome: string,
  funcao: string,
  telefone: string,
  frenteIds: string[],
  cobrancaPausada = false
): Usuario {
  return {
    id, nome, funcao, telefone, frenteIds, cobrancaPausada,
    criadoEm: CRIACAO, criadoPorId: "u-eduardo",
    ativo: true,
    gerenciaAcessos: id === DONO_ID,
    acessoRemovidoEm: null,
    acessoRemovidoPorId: null,
  };
}

export const USUARIOS: Usuario[] = [
  conta("u-italo", "Ítalo", "Fundador · aprovações e gravações", "+55 82 90000-0001", ["f-vsl", "f-conteudo"]),
  conta("u-eduardo", "Eduardo", "Tráfego e sistemas", "+55 81 90000-0002", ["f-campanhas"]),
  conta("u-scarlett", "Scarlett", "Operação e financeiro", "+55 82 90000-0003", ["f-admin", "f-suporte"]),
  conta("u-larissa", "Larissa", "Comercial", "+55 82 90000-0004", ["f-comercial"]),
  conta("u-vitoria", "Vitória", "Comercial", "+55 82 90000-0005", ["f-comercial"]),
  conta("u-ana", "Ana", "Conteúdo e vídeo", "+55 82 90000-0006", ["f-conteudo", "f-vsl"]),
  conta("u-bruno", "Bruno", "Design", "+55 82 90000-0007", ["f-conteudo", "f-campanhas"]),
  conta("u-camila", "Camila", "Suporte às alunas", "+55 82 90000-0008", ["f-suporte"], true),
  conta("u-diego", "Diego", "Eventos presenciais", "+55 82 90000-0009", ["f-eventos"]),
];

// liderId aqui é só a "pessoa de referência" da frente, usada para sugerir
// responsável quando o pedido não diz quem faz. Não dá poder nenhum.
export const FRENTES: Frente[] = [
  { id: "f-campanhas", nome: "Campanhas e tráfego", liderId: "u-eduardo", usaRevisao: true },
  { id: "f-eventos", nome: "Eventos presenciais", liderId: "u-diego", usaRevisao: false },
  { id: "f-conteudo", nome: "Conteúdo e redes", liderId: "u-ana", usaRevisao: true },
  { id: "f-vsl", nome: "VSL e formação", liderId: "u-italo", usaRevisao: true },
  { id: "f-comercial", nome: "Comercial", liderId: "u-larissa", usaRevisao: false },
  { id: "f-suporte", nome: "Suporte às alunas", liderId: "u-camila", usaRevisao: false },
  { id: "f-admin", nome: "Administrativo", liderId: "u-scarlett", usaRevisao: false },
];

interface TarefaSeed {
  id: string;
  titulo: string;
  descricao: string;
  frenteId: string | null;
  responsavelId: string | null;
  criadorId: string;
  estado: Tarefa["estado"];
  prioridade: Tarefa["prioridade"];
  prazoOffset: number | null;
  origem?: Tarefa["origem"];
  motivoBloqueio?: string;
  checklist?: [string, boolean][];
  envolvidosIds?: string[];
}

const TAREFAS_SEED: TarefaSeed[] = [
  // Tarefas do Ítalo, pedidas por outras pessoas: ele também é cobrado.
  { id: "t-01", titulo: "Gravar 3 vídeos de remarketing do checkout (presencial outubro)", descricao: "Vídeos curtos pra quem abriu o checkout e não comprou. Maceió, Aracaju e Arapiraca. Roteiros já aprovados.", frenteId: "f-conteudo", responsavelId: "u-italo", criadorId: "u-eduardo", estado: "a_fazer", prioridade: "alta", prazoOffset: -2, envolvidosIds: ["u-ana"], checklist: [["Roteiro aprovado", true], ["Gravação", false], ["Envio pra edição", false]] },
  { id: "t-02", titulo: "Aprovar roteiro da aula 2 da VSL", descricao: "Roteiro revisado pela Ana com o ajuste de precificação.", frenteId: "f-vsl", responsavelId: "u-italo", criadorId: "u-ana", estado: "em_revisao", prioridade: "media", prazoOffset: 0 },
  { id: "t-03", titulo: "Definir brinde do presencial de Aracaju", descricao: "Diego levantou 3 opções de fornecedor, falta escolher.", frenteId: "f-eventos", responsavelId: "u-italo", criadorId: "u-diego", estado: "a_fazer", prioridade: "media", prazoOffset: 3 },
  // Tarefas que o Ítalo pediu.
  { id: "t-04", titulo: "Confirmar hotel e sala do presencial de Maceió", descricao: "Fechar contrato do espaço e mandar comprovante pro financeiro.", frenteId: "f-eventos", responsavelId: "u-diego", criadorId: "u-italo", estado: "bloqueada", prioridade: "urgente", prazoOffset: -1, motivoBloqueio: "Aguardando o hotel mandar o contrato revisado." },
  { id: "t-05", titulo: "Subir criativos novos da campanha presencial Arapiraca", descricao: "Trocar os 2 criativos com CPA acima da média.", frenteId: "f-campanhas", responsavelId: "u-eduardo", criadorId: "u-italo", estado: "a_fazer", prioridade: "alta", prazoOffset: 1 },
  { id: "t-06", titulo: "Ligar pras 12 inscritas do grupo VIP que não confirmaram", descricao: "Lista na planilha do grupo VIP (faixa 3 em diante).", frenteId: "f-comercial", responsavelId: "u-vitoria", criadorId: "u-italo", estado: "em_andamento", prioridade: "alta", prazoOffset: 0 },
  // Pedidos entre colegas.
  { id: "t-07", titulo: "Artes do carrossel 'erros de estoque na Black Friday'", descricao: "8 cards no padrão da marca.", frenteId: "f-conteudo", responsavelId: "u-bruno", criadorId: "u-ana", estado: "em_revisao", prioridade: "media", prazoOffset: 0, checklist: [["Capa", true], ["Cards 2 a 7", true], ["CTA final", true]] },
  { id: "t-08", titulo: "Responder alunas com dúvida sobre o acesso à trilha", descricao: "7 mensagens acumuladas no suporte.", frenteId: "f-suporte", responsavelId: "u-camila", criadorId: "u-scarlett", estado: "a_fazer", prioridade: "alta", prazoOffset: -3 },
  { id: "t-09", titulo: "Emitir notas fiscais das inscrições de setembro", descricao: "", frenteId: "f-admin", responsavelId: "u-scarlett", criadorId: "u-larissa", estado: "a_fazer", prioridade: "media", prazoOffset: 4 },
  { id: "t-10", titulo: "Script de follow-up pra quem saiu do checkout", descricao: "Mensagem de WhatsApp em 3 toques.", frenteId: "f-comercial", responsavelId: "u-larissa", criadorId: "u-eduardo", estado: "concluida", prioridade: "alta", prazoOffset: -4 },
  { id: "t-11", titulo: "Relatório semanal de CPA das campanhas de venda", descricao: "", frenteId: "f-campanhas", responsavelId: "u-eduardo", criadorId: "u-scarlett", estado: "concluida", prioridade: "media", prazoOffset: -1 },
  { id: "t-12", titulo: "Capa e thumbnails dos reels da semana", descricao: "", frenteId: "f-conteudo", responsavelId: "u-bruno", criadorId: "u-ana", estado: "a_fazer", prioridade: "baixa", prazoOffset: 2 },
  { id: "t-13", titulo: "Levantar datas do presencial de novembro", descricao: "Opções de cidade e data pra decisão do Ítalo.", frenteId: "f-eventos", responsavelId: "u-diego", criadorId: "u-scarlett", estado: "em_andamento", prioridade: "media", prazoOffset: 6, envolvidosIds: ["u-italo"] },
  { id: "t-14", titulo: "Organizar depoimentos de alunas pra página de vendas", descricao: "", frenteId: null, responsavelId: null, criadorId: "u-larissa", estado: "triagem", prioridade: "media", prazoOffset: null, origem: "ia" },
  { id: "t-15", titulo: "Atualizar planilha de comissões do comercial", descricao: "", frenteId: "f-admin", responsavelId: "u-scarlett", criadorId: "u-vitoria", estado: "em_andamento", prioridade: "baixa", prazoOffset: -1 },
];

export function gerarTarefasIniciais(hoje = hojeISO()): Tarefa[] {
  return TAREFAS_SEED.map((s, i) => {
    const criadoEm = new Date(Date.now() - (8 - (i % 5)) * 86_400_000).toISOString();
    return {
      id: s.id,
      titulo: s.titulo,
      descricao: s.descricao,
      frenteId: s.frenteId,
      responsavelId: s.responsavelId,
      envolvidosIds: s.envolvidosIds ?? [],
      criadorId: s.criadorId,
      estado: s.estado,
      estadoAnterior: s.estado === "bloqueada" ? "em_andamento" : null,
      motivoBloqueio: s.motivoBloqueio ?? null,
      prioridade: s.prioridade,
      prazo: s.prazoOffset === null ? null : somarDias(hoje, s.prazoOffset),
      origem: s.origem ?? "manual",
      versao: 1,
      checklist: (s.checklist ?? []).map(([texto, concluido], j) => ({
        id: `${s.id}-c${j}`,
        texto,
        concluido,
      })),
      comentarios:
        s.id === "t-04"
          ? [{ id: "t-04-m1", autorId: "u-diego", texto: "Liguei pro hotel hoje cedo, prometeram o contrato até amanhã.", criadoEm: new Date(Date.now() - 3 * 3_600_000).toISOString() }]
          : [],
      criadoEm,
      atualizadoEm: criadoEm,
    };
  });
}

export function gerarEventosIniciais(tarefas: Tarefa[]): EventoTarefa[] {
  return tarefas.map((t) => ({
    id: `ev-${t.id}`,
    tarefaId: t.id,
    tipo: "criada" as const,
    atorId: t.criadorId,
    antes: null,
    depois: t.origem === "ia" ? "Pedida em texto livre (IA)" : "Pedida manualmente",
    criadoEm: t.criadoEm,
  }));
}

export function gerarMensagensIniciais(): Mensagem[] {
  const agora = Date.now();
  const hora = (h: number) => new Date(agora - h * 3_600_000).toISOString();
  return [
    { id: "m-1", chave: "t-05|atribuicao|u-eduardo|u-eduardo", tarefaId: "t-05", regra: "atribuicao", autorId: null, destinatarioId: "u-eduardo", texto: "Oi, Eduardo! O Ítalo te pediu: *Subir criativos novos da campanha presencial Arapiraca*. Prazo: amanhã.", status: "enviado", motivo: null, tentativas: 1, criadoEm: hora(26) },
    { id: "m-2", chave: "t-01|cobranca_manual|d0|u-eduardo>u-italo", tarefaId: "t-01", regra: "cobranca_manual", autorId: "u-eduardo", destinatarioId: "u-italo", texto: "Ítalo, o Eduardo está cobrando: *Gravar 3 vídeos de remarketing do checkout*. Venceu há 2 dias. As campanhas de remarketing estão paradas esperando esses vídeos.", status: "enviado", motivo: null, tentativas: 1, criadoEm: hora(5) },
    { id: "m-3", chave: "t-08|vencida|d0|u-camila", tarefaId: "t-08", regra: "vencida", autorId: null, destinatarioId: "u-camila", texto: "", status: "ignorado", motivo: "Cobrança pausada pra essa pessoa", tentativas: 0, criadoEm: hora(4) },
    { id: "m-4", chave: "t-08|escalonamento|d0|u-scarlett", tarefaId: "t-08", regra: "escalonamento", autorId: null, destinatarioId: "u-scarlett", texto: "Scarlett, o que você pediu pra Camila (*Responder alunas com dúvida sobre o acesso à trilha*) está vencido há 3 dias.", status: "falhou", motivo: "Provedor respondeu 503 (instabilidade). Nova tentativa agendada.", tentativas: 2, criadoEm: hora(4) },
    { id: "m-5", chave: "t-04|cobranca_manual|d0|u-italo>u-diego", tarefaId: "t-04", regra: "cobranca_manual", autorId: "u-italo", destinatarioId: "u-diego", texto: "Diego, o Ítalo está cobrando: *Confirmar hotel e sala do presencial de Maceió*. Venceu ontem.", status: "enviado", motivo: null, tentativas: 1, criadoEm: hora(2) },
  ];
}
