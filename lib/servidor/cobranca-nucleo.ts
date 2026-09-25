import { and, desc, eq, gte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Banco } from "@/db";
import { eventosTarefa, mensagens, tarefas, usuarios } from "@/db/schema";
import { estaAtiva } from "@/lib/regras";
import { descreverPrazo, diferencaDias, hojeISO, somarDias } from "@/lib/datas";
import { enfileirar, lerConfig, mensagensDoDia, primeiroNome } from "./fila";

// Cobrança manual (início do bloco C). Modelo horizontal: qualquer pessoa
// cobra qualquer tarefa de outra — o Ítalo cobra a equipe e a equipe cobra o
// Ítalo. A cobrança vai para a fila de mensagens (outbox); quem envia pelo
// WhatsApp é o n8n (C2/C3). Aqui só se grava, com chave idempotente:
// uma cobrança por tarefa, por autor, por dia.

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; motivo: string };
type Autor = { id: string; nome: string };

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LIMITE_RECADO = 300;

export async function cobrarTarefa(
  banco: Banco,
  autor: Autor,
  tarefaId: string,
  recado: string,
  hoje = hojeISO()
): Promise<Resultado<{ status: "pendente" | "ignorado"; destinatario: string }>> {
  const recadoLimpo = recado.trim();
  if (recadoLimpo.length > LIMITE_RECADO) return { ok: false, motivo: `O recado pode ter até ${LIMITE_RECADO} caracteres.` };
  if (!FORMATO_UUID.test(tarefaId)) return { ok: false, motivo: "Tarefa não encontrada." };

  return banco.transaction(async (tx) => {
    const [t] = await tx.select().from(tarefas).where(eq(tarefas.id, tarefaId)).limit(1);
    if (!t) return { ok: false, motivo: "Tarefa não encontrada." };
    if (!t.responsavelId) return { ok: false, motivo: "A tarefa não tem responsável. Defina quem faz antes de cobrar." };
    if (!estaAtiva(t)) return { ok: false, motivo: "A tarefa já foi concluída ou arquivada." };
    if (t.responsavelId === autor.id) return { ok: false, motivo: "A tarefa é sua. Atualize o andamento em vez de se cobrar." };

    const [dest] = await tx.select().from(usuarios).where(eq(usuarios.id, t.responsavelId)).limit(1);
    if (!dest?.ativo) return { ok: false, motivo: "Quem faz essa tarefa não tem mais acesso. Passe a tarefa para outra pessoa." };

    // Limite diário de quem recebe (config_cobranca): na cobrança manual, em
    // vez de registrar como ignorada, avisa quem está cobrando.
    const config = await lerConfig(tx);
    const n = await mensagensDoDia(tx, dest.id, hoje);
    if (config && n >= config.limiteDiarioPorPessoa)
      return { ok: false, motivo: `${primeiroNome(dest.nome)} já recebeu ${n} mensagens hoje, o limite do dia. Tente amanhã ou fale direto.` };

    let situacao = `Prazo: ${descreverPrazo(t.prazo, hoje).toLowerCase()}.`;
    if (t.prazo) {
      const dif = diferencaDias(hoje, t.prazo);
      if (dif < 0) situacao = `Venceu ${dif === -1 ? "ontem" : `há ${-dif} dias`}.`;
    }
    const texto = `${primeiroNome(dest.nome)}, ${primeiroNome(autor.nome)} está cobrando: *${t.titulo}*. ${situacao}${recadoLimpo ? ` ${recadoLimpo}` : ""}`;

    // Pausada ou sem WhatsApp: a fila registra como ignorada, com o motivo.
    const { inserida, status } = await enfileirar(
      tx,
      {
        chave: `${t.id}|cobranca_manual|${hoje}|${autor.id}>${dest.id}`,
        tarefaId: t.id,
        regra: "cobranca_manual",
        autorId: autor.id,
        destinatarioId: dest.id,
        texto,
      },
      hoje
    );
    if (!inserida || !status) return { ok: false, motivo: "Você já cobrou essa tarefa hoje. A pessoa já foi avisada." };

    await tx.insert(eventosTarefa).values({
      tarefaId: t.id,
      tipo: "cobranca",
      atorId: autor.id,
      depois: `Cobrou ${dest.nome}${recadoLimpo ? `: "${recadoLimpo}"` : ""}`,
    });
    return { ok: true, status, destinatario: dest.nome };
  });
}

// Opt-out: cada pessoa pausa as próprias cobranças no WhatsApp. Continua
// vendo tudo no sistema; só para de receber mensagem.
export async function definirPausa(banco: Banco, contaId: string, pausada: boolean): Promise<void> {
  await banco.update(usuarios).set({ cobrancaPausada: pausada }).where(eq(usuarios.id, contaId));
}

// ---- Leitura: tela Cobranças e Início ----

export interface MensagemVisao {
  id: string;
  regra: string;
  status: string;
  motivo: string | null;
  texto: string;
  tentativas: number;
  criadoEm: string;
  enviadaEm: string | null;
  tarefa: { id: string; titulo: string } | null;
  autor: { id: string; nome: string } | null;
  destinatario: { id: string; nome: string };
}

const autorM = alias(usuarios, "autor_m");
const destM = alias(usuarios, "dest_m");

export async function listarMensagens(banco: Banco, filtro: { destinatarioId?: string; desde?: string } = {}, limite = 200): Promise<MensagemVisao[]> {
  const condicoes = [];
  if (filtro.destinatarioId) condicoes.push(eq(mensagens.destinatarioId, filtro.destinatarioId));
  if (filtro.desde) condicoes.push(gte(mensagens.criadoEm, new Date(filtro.desde)));
  const linhas = await banco
    .select({
      id: mensagens.id,
      regra: mensagens.regra,
      status: mensagens.status,
      motivo: mensagens.motivo,
      texto: mensagens.texto,
      tentativas: mensagens.tentativas,
      criadoEm: mensagens.criadoEm,
      enviadaEm: mensagens.enviadaEm,
      tarefaId: tarefas.id,
      tarefaTitulo: tarefas.titulo,
      autorId: autorM.id,
      autorNome: autorM.nome,
      destId: destM.id,
      destNome: destM.nome,
    })
    .from(mensagens)
    .innerJoin(destM, eq(destM.id, mensagens.destinatarioId))
    .leftJoin(autorM, eq(autorM.id, mensagens.autorId))
    .leftJoin(tarefas, eq(tarefas.id, mensagens.tarefaId))
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(mensagens.criadoEm))
    .limit(limite);
  return linhas.map((l) => ({
    id: l.id,
    regra: l.regra,
    status: l.status,
    motivo: l.motivo,
    texto: l.texto,
    tentativas: l.tentativas,
    criadoEm: l.criadoEm.toISOString(),
    enviadaEm: l.enviadaEm?.toISOString() ?? null,
    tarefa: l.tarefaId ? { id: l.tarefaId, titulo: l.tarefaTitulo! } : null,
    autor: l.autorId ? { id: l.autorId, nome: l.autorNome! } : null,
    destinatario: { id: l.destId, nome: l.destNome },
  }));
}

// Cobranças feitas por colegas nos últimos dias, para o Início.
export async function cobrancasRecebidas(banco: Banco, contaId: string, dias = 7, hoje = hojeISO()): Promise<MensagemVisao[]> {
  const desde = `${somarDias(hoje, -dias)}T03:00:00Z`; // meia-noite em São Paulo
  const todas = await listarMensagens(banco, { destinatarioId: contaId, desde }, 50);
  return todas.filter((m) => m.regra === "cobranca_manual" && m.tarefa);
}
