import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Banco } from "@/db";
import { checklistItens, comentarios, eventosTarefa, frentes, mensagens, tarefas } from "@/db/schema";
import { detalharTarefa, listarTarefas, listarTriagem, montarInicio, montarPainel } from "@/lib/servidor/consultas";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// A6 — as telas leem do banco e as contagens batem.

let banco: Banco;
let pg: PGlite;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
});

const HOJE = "2026-09-25";
let italo: Awaited<ReturnType<typeof criarConta>>;
let ana: Awaited<ReturnType<typeof criarConta>>;
let diego: Awaited<ReturnType<typeof criarConta>>;
const ids: Record<string, string> = {};

beforeEach(async () => {
  await limparBanco(pg);
  italo = await criarConta(banco, { nome: "Ítalo", dono: true, gerenciaAcessos: true });
  ana = await criarConta(banco, { nome: "Ana" });
  diego = await criarConta(banco, { nome: "Diego" });
  const [f] = await banco.insert(frentes).values({ nome: "Conteúdo e redes", usaRevisao: true }).returning();
  const base = { frenteId: f.id, prioridade: "media" as const };
  const criar = async (chave: string, v: Partial<typeof tarefas.$inferInsert> & { titulo: string; criadorId: string }) => {
    const [t] = await banco.insert(tarefas).values({ ...base, ...v }).returning({ id: tarefas.id });
    ids[chave] = t.id;
  };
  // Ítalo pediu à Ana: vencida
  await criar("vencida", { titulo: "Vídeos de remarketing", criadorId: italo.id, responsavelId: ana.id, prazo: "2026-09-22", estado: "a_fazer", prioridade: "alta" });
  // Ítalo pediu ao Diego: bloqueada
  await criar("bloqueada", { titulo: "Hotel de Maceió", criadorId: italo.id, responsavelId: diego.id, prazo: "2026-09-24", estado: "bloqueada", motivoBloqueio: "Esperando contrato" });
  // Ana pediu ao Ítalo: vence amanhã
  await criar("amanha", { titulo: "Aprovar roteiro", criadorId: ana.id, responsavelId: italo.id, prazo: "2026-09-26", estado: "a_fazer" });
  // Na triagem, sem dono
  await criar("triagem", { titulo: "Depoimentos", criadorId: ana.id, responsavelId: null, prazo: null, frenteId: null, estado: "triagem" });
  // Concluída e arquivada não contam como abertas
  await criar("concluida", { titulo: "Script de follow-up", criadorId: italo.id, responsavelId: ana.id, prazo: "2026-09-20", estado: "concluida" });
  await criar("arquivada", { titulo: "Coisa antiga", criadorId: italo.id, responsavelId: ana.id, prazo: "2026-09-01", estado: "arquivada" });
});

describe("Início", () => {
  it("com a Ana: 1 vencida; o que o Ítalo pediu: 2 em aberto, 2 vencidas", async () => {
    const inicioAna = await montarInicio(banco, ana.id, HOJE);
    expect(inicioAna.comVoce.map((t) => t.titulo)).toEqual(["Vídeos de remarketing"]);
    expect(inicioAna.vencidasComVoce).toHaveLength(1);
    // Inclui o pedido que ainda está na triagem, sem dono: ela precisa ver que está esperando alguém.
    expect(inicioAna.vocePediu.map((t) => t.titulo).sort()).toEqual(["Aprovar roteiro", "Depoimentos"]);

    const inicioItalo = await montarInicio(banco, italo.id, HOJE);
    expect(inicioItalo.comVoce.map((t) => t.titulo)).toEqual(["Aprovar roteiro"]);
    expect(inicioItalo.proximasComVoce).toHaveLength(1);
    expect(inicioItalo.vocePediu).toHaveLength(2); // vídeos (Ana) e hotel (Diego)
    expect(inicioItalo.vocePediuVencidas).toBe(2);

    const inicioDiego = await montarInicio(banco, diego.id, HOJE);
    expect(inicioDiego.bloqueadasComVoce.map((t) => t.motivoBloqueio)).toEqual(["Esperando contrato"]);
  });
});

describe("Quadro e Triagem", () => {
  it("arquivada fica de fora; a mais urgente vem primeiro; nomes resolvidos", async () => {
    const lista = await listarTarefas(banco);
    expect(lista.map((t) => t.titulo)).not.toContain("Coisa antiga");
    expect(lista).toHaveLength(5);
    expect(lista[0].prazo! <= lista[1].prazo!).toBe(true);
    const video = lista.find((t) => t.titulo === "Vídeos de remarketing")!;
    expect(video.responsavel?.nome).toBe("Ana");
    expect(video.criador.nome).toBe("Ítalo");
    expect(video.frente?.nome).toBe("Conteúdo e redes");
  });

  it("triagem lista só o que está em triagem", async () => {
    const t = await listarTriagem(banco);
    expect(t.map((x) => x.titulo)).toEqual(["Depoimentos"]);
    expect(t[0].responsavel).toBeNull();
  });
});

describe("Painel", () => {
  it("contagens batem com as tarefas e as cobranças", async () => {
    await banco.insert(mensagens).values([
      { chave: "c1", regra: "cobranca_manual", autorId: ana.id, destinatarioId: italo.id, texto: "..." },
      { chave: "c2", regra: "cobranca_manual", autorId: italo.id, destinatarioId: diego.id, texto: "..." },
      { chave: "f1", regra: "vencida", destinatarioId: ana.id, texto: "...", status: "falhou" },
    ]);
    const p = await montarPainel(banco, HOJE);
    expect(p.vencidas.map((t) => t.titulo).sort()).toEqual(["Hotel de Maceió", "Vídeos de remarketing"]);
    expect(p.semDono.map((t) => t.titulo)).toEqual(["Depoimentos"]);
    expect(p.bloqueadas).toHaveLength(1);
    expect(p.vencendo.map((t) => t.titulo)).toEqual(["Aprovar roteiro"]);
    expect(p.falhasWhatsapp).toBe(1);
    const linhaItalo = p.porPessoa.find((x) => x.pessoa.nome === "Ítalo")!;
    expect(linhaItalo).toMatchObject({ comEla: 1, pediuEmAberto: 2, cobrou: 1, foiCobrada: 1 });
  });
});

describe("Detalhe", () => {
  it("traz checklist, comentários e histórico; id inválido ou inexistente dá null", async () => {
    await banco.insert(checklistItens).values([
      { tarefaId: ids.vencida, texto: "Roteiro", ordem: 1, concluidoEm: new Date() },
      { tarefaId: ids.vencida, texto: "Gravação", ordem: 2 },
    ]);
    await banco.insert(comentarios).values({ tarefaId: ids.vencida, autorId: ana.id, texto: "Gravo amanhã cedo" });
    await banco.insert(eventosTarefa).values({ tarefaId: ids.vencida, tipo: "criada", atorId: italo.id, depois: "Pedida manualmente" });

    const d = await detalharTarefa(banco, ids.vencida);
    expect(d?.checklist.map((c) => [c.texto, c.concluido])).toEqual([
      ["Roteiro", true],
      ["Gravação", false],
    ]);
    expect(d?.checklistFeitos).toBe(1);
    expect(d?.comentarios[0]).toMatchObject({ autor: "Ana", texto: "Gravo amanhã cedo" });
    expect(d?.eventos[0]).toMatchObject({ tipo: "criada", ator: "Ítalo" });
    expect(d?.frenteUsaRevisao).toBe(true);

    expect(await detalharTarefa(banco, "nao-e-um-uuid")).toBeNull();
    expect(await detalharTarefa(banco, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
