import type { Mensagem, RegraCobranca, Tarefa, Usuario } from "./types";
import { FUSO, descreverPrazo, diferencaDias, hojeISO } from "./datas";
import { estaAtiva } from "./regras";

// Simulação do que o n8n faz na seção 7 do spec: lê as tarefas, aplica as
// regras e grava na fila de saída com chave idempotente
// (tarefa + regra + janela + destinatário). Rodar duas vezes não duplica.
//
// Modelo horizontal: não existe gestor para escalonar. Quando uma tarefa
// fica vencida, quem PEDIU é avisado — seja o Ítalo, seja um colega.
// Além das automáticas, qualquer pessoa cobra qualquer tarefa na mão.

export const JANELA_INICIO = 8;
export const JANELA_FIM = 19;
export const DIAS_PARA_AVISAR_QUEM_PEDIU = 2;

export function horaAtualSP(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO,
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  ) % 24;
}

export function dentroDaJanela(hora = horaAtualSP()): boolean {
  return hora >= JANELA_INICIO && hora < JANELA_FIM;
}

export function primeiroNome(u: Usuario | undefined): string {
  return u?.nome.split(" ")[0] ?? "";
}

interface Candidata {
  chave: string;
  tarefaId: string;
  regra: RegraCobranca;
  autorId: string | null;
  destinatarioId: string;
  texto: string;
}

function montarMensagem(c: Candidata, usuarios: Usuario[], ignorarJanela: boolean): Mensagem {
  const dest = usuarios.find((u) => u.id === c.destinatarioId);
  const base = {
    id: `m-${Math.random().toString(36).slice(2, 10)}`,
    chave: c.chave,
    tarefaId: c.tarefaId,
    regra: c.regra,
    autorId: c.autorId,
    destinatarioId: c.destinatarioId,
    texto: c.texto,
    tentativas: 0,
    criadoEm: new Date().toISOString(),
  };
  if (!dest || dest.cobrancaPausada) {
    return { ...base, status: "ignorado", motivo: "Cobrança pausada pra essa pessoa" };
  }
  if (!ignorarJanela && !dentroDaJanela()) {
    return {
      ...base,
      status: "pendente",
      motivo: `Fora da janela de envio (${JANELA_INICIO}h às ${JANELA_FIM}h). Sai no próximo horário comercial.`,
    };
  }
  return { ...base, status: "enviado", motivo: null, tentativas: 1 };
}

function quemPediu(t: Tarefa, usuarios: Usuario[]): string {
  return primeiroNome(usuarios.find((u) => u.id === t.criadorId));
}

export function mensagemDeAtribuicao(
  t: Tarefa,
  usuarios: Usuario[],
  existentes: Mensagem[]
): Mensagem | null {
  if (!t.responsavelId || !estaAtiva(t) || t.estado === "triagem") return null;
  const chave = `${t.id}|atribuicao|${t.responsavelId}|${t.responsavelId}`;
  if (existentes.some((m) => m.chave === chave)) return null;
  const dest = usuarios.find((u) => u.id === t.responsavelId);
  const pedido =
    t.criadorId === t.responsavelId ? "Você anotou pra você" : `${quemPediu(t, usuarios)} te pediu`;
  return montarMensagem(
    {
      chave,
      tarefaId: t.id,
      regra: "atribuicao",
      autorId: t.criadorId,
      destinatarioId: t.responsavelId,
      texto: `Oi, ${primeiroNome(dest)}! ${pedido}: *${t.titulo}*. Prazo: ${descreverPrazo(t.prazo).toLowerCase()}.`,
    },
    usuarios,
    false
  );
}

export type ResultadoCobrancaManual =
  | { ok: true; mensagem: Mensagem }
  | { ok: false; motivo: string };

// Cobrança feita por uma pessoa: uma por tarefa, por autor, por dia.
export function cobrancaManual(
  t: Tarefa,
  autor: Usuario,
  usuarios: Usuario[],
  existentes: Mensagem[],
  recado: string
): ResultadoCobrancaManual {
  if (!t.responsavelId) return { ok: false, motivo: "A tarefa não tem responsável. Defina quem faz antes de cobrar." };
  if (!estaAtiva(t)) return { ok: false, motivo: "A tarefa já foi concluída ou arquivada." };
  if (t.responsavelId === autor.id) return { ok: false, motivo: "A tarefa é sua. Atualize o andamento em vez de se cobrar." };
  const hoje = hojeISO();
  const chave = `${t.id}|cobranca_manual|${hoje}|${autor.id}>${t.responsavelId}`;
  if (existentes.some((m) => m.chave === chave)) {
    return { ok: false, motivo: "Você já cobrou essa tarefa hoje. A pessoa já foi avisada." };
  }
  const dest = usuarios.find((u) => u.id === t.responsavelId);
  let situacao = `Prazo: ${descreverPrazo(t.prazo).toLowerCase()}.`;
  if (t.prazo) {
    const dif = diferencaDias(hoje, t.prazo);
    if (dif < 0) situacao = `Venceu ${dif === -1 ? "ontem" : `há ${-dif} dias`}.`;
  }
  const extra = recado.trim() ? ` ${recado.trim()}` : "";
  return {
    ok: true,
    mensagem: montarMensagem(
      {
        chave,
        tarefaId: t.id,
        regra: "cobranca_manual",
        autorId: autor.id,
        destinatarioId: t.responsavelId,
        texto: `${primeiroNome(dest)}, ${primeiroNome(autor)} está cobrando: *${t.titulo}*. ${situacao}${extra}`,
      },
      usuarios,
      true // cobrança feita por alguém sai na hora; quem cobra escolheu o momento
    ),
  };
}

export interface ResultadoRodada {
  novas: Mensagem[];
  jaExistiam: number;
}

export function rodarCobrancas(
  tarefas: Tarefa[],
  usuarios: Usuario[],
  existentes: Mensagem[],
  opcoes: { ignorarJanela?: boolean } = {}
): ResultadoRodada {
  const hoje = hojeISO();
  const candidatas: Candidata[] = [];

  for (const t of tarefas) {
    if (!estaAtiva(t) || t.estado === "triagem" || !t.responsavelId || !t.prazo) continue;
    const dest = usuarios.find((u) => u.id === t.responsavelId);
    const dif = diferencaDias(hoje, t.prazo);

    // Quem recebeu o aviso de atribuição hoje já soube do prazo: não repetir no mesmo dia.
    const avisadoHoje = existentes.some(
      (m) =>
        m.tarefaId === t.id &&
        m.regra === "atribuicao" &&
        m.destinatarioId === t.responsavelId &&
        m.criadoEm.slice(0, 10) === new Date().toISOString().slice(0, 10)
    );

    if (dif === 1 && !avisadoHoje) {
      candidatas.push({
        chave: `${t.id}|prazo_proximo|${hoje}|${t.responsavelId}`,
        tarefaId: t.id,
        regra: "prazo_proximo",
        autorId: null,
        destinatarioId: t.responsavelId,
        texto: `${primeiroNome(dest)}, lembrete: *${t.titulo}* vence amanhã.`,
      });
    }

    // Tarefa bloqueada não recebe cobrança de atraso: o bloqueio já está registrado.
    if (dif < 0 && t.estado !== "bloqueada") {
      candidatas.push({
        chave: `${t.id}|vencida|${hoje}|${t.responsavelId}`,
        tarefaId: t.id,
        regra: "vencida",
        autorId: null,
        destinatarioId: t.responsavelId,
        texto: `${primeiroNome(dest)}, *${t.titulo}* (pedido de ${quemPediu(t, usuarios)}) venceu ${dif === -1 ? "ontem" : `há ${-dif} dias`}. Consegue atualizar o andamento no sistema?`,
      });
      if (-dif >= DIAS_PARA_AVISAR_QUEM_PEDIU && t.criadorId !== t.responsavelId) {
        candidatas.push({
          chave: `${t.id}|escalonamento|${hoje}|${t.criadorId}`,
          tarefaId: t.id,
          regra: "escalonamento",
          autorId: null,
          destinatarioId: t.criadorId,
          texto: `${quemPediu(t, usuarios)}, o que você pediu pra ${primeiroNome(dest)} (*${t.titulo}*) está vencido há ${-dif} dias.`,
        });
      }
    }
  }

  const chavesExistentes = new Set(existentes.map((m) => m.chave));
  const ineditas = candidatas.filter((c) => !chavesExistentes.has(c.chave));
  return {
    novas: ineditas.map((c) => montarMensagem(c, usuarios, opcoes.ignorarJanela ?? false)),
    jaExistiam: candidatas.length - ineditas.length,
  };
}
