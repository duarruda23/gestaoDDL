import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosTarefa, frentes, tarefas, usuarios } from "@/db/schema";
import {
  CONFLITO,
  adicionarItem,
  alternarItem,
  arquivarTarefa,
  comentar,
  criarTarefa,
  desarquivarTarefa,
  editarTarefa,
  mudarEtapa,
  removerItem,
} from "@/lib/servidor/tarefas-nucleo";
import { detalharTarefa } from "@/lib/servidor/consultas";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// A7 — escrita de tarefas: regras de etapa, versão e histórico.

let banco: Banco;
let pg: PGlite;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
});

let italo: Awaited<ReturnType<typeof criarConta>>;
let ana: Awaited<ReturnType<typeof criarConta>>;
let frenteId: string;
let frenteRevisaoId: string;

beforeEach(async () => {
  await limparBanco(pg);
  italo = await criarConta(banco, { nome: "Ítalo", dono: true, gerenciaAcessos: true });
  ana = await criarConta(banco, { nome: "Ana" });
  const [f, fr] = await banco
    .insert(frentes)
    .values([{ nome: "Eventos" }, { nome: "Conteúdo", usaRevisao: true }])
    .returning();
  frenteId = f.id;
  frenteRevisaoId = fr.id;
});

const completa = () => ({
  titulo: "  Fechar hotel de Maceió  ",
  descricao: "",
  responsavelId: ana.id,
  prazo: "2026-10-02",
  frenteId,
  prioridade: "alta" as const,
});

async function eventos(id: string) {
  return banco.select().from(eventosTarefa).where(eq(eventosTarefa.tarefaId, id)).orderBy(eventosTarefa.id);
}

describe("criar", () => {
  it("completa nasce em 'a fazer'; faltando algo vai pra triagem", async () => {
    const a = await criarTarefa(banco, ana, { ...completa(), itens: ["Cotar", " ", "Reservar"] });
    expect(a).toMatchObject({ ok: true, estado: "a_fazer" });
    const d = await detalharTarefa(banco, (a as { id: string }).id);
    expect(d?.titulo).toBe("Fechar hotel de Maceió");
    expect(d?.criador.nome).toBe("Ana"); // modelo horizontal: a Ana pediu pra ela mesma
    expect(d?.checklist.map((c) => c.texto)).toEqual(["Cotar", "Reservar"]);

    const b = await criarTarefa(banco, ana, { ...completa(), responsavelId: null });
    expect(b).toMatchObject({ ok: true, estado: "triagem" });
  });

  it("recusa título vazio, prazo impossível e responsável sem acesso", async () => {
    expect(await criarTarefa(banco, ana, { ...completa(), titulo: "   " })).toMatchObject({ ok: false });
    expect(await criarTarefa(banco, ana, { ...completa(), prazo: "2026-02-30" })).toMatchObject({ ok: false, motivo: "Prazo inválido." });
    await banco.update(usuarios).set({ ativo: false, acessoRemovidoEm: new Date() }).where(eq(usuarios.id, ana.id));
    expect(await criarTarefa(banco, italo, completa())).toMatchObject({ ok: false });
  });
});

describe("editar", () => {
  it("salva, registra histórico e recusa versão velha", async () => {
    const { id } = (await criarTarefa(banco, italo, completa())) as { id: string };
    const r = await editarTarefa(banco, ana, id, 1, { prazo: "2026-10-05", prioridade: "urgente", titulo: "Hotel Maceió" });
    expect(r).toEqual({ ok: true, versao: 2 });

    // Ítalo abriu a tarefa na versão 1 e tenta salvar por cima: recusado.
    expect(await editarTarefa(banco, italo, id, 1, { prioridade: "baixa" })).toEqual({ ok: false, motivo: CONFLITO });

    const ev = await eventos(id);
    expect(ev.map((e) => [e.tipo, e.antes, e.depois])).toEqual([
      ["criada", null, "Pedida manualmente"],
      ["prazo", "2026-10-02", "2026-10-05"],
      ["prioridade", "alta", "urgente"],
    ]);
    expect(ev[1].atorId).toBe(ana.id);
  });

  it("não deixa tirar o dono de tarefa em execução; na triagem pode", async () => {
    const { id } = (await criarTarefa(banco, italo, completa())) as { id: string };
    expect(await editarTarefa(banco, ana, id, 1, { responsavelId: null })).toMatchObject({ ok: false });
    const t = (await criarTarefa(banco, italo, { ...completa(), prazo: null })) as { id: string };
    expect(await editarTarefa(banco, ana, t.id, 1, { responsavelId: null })).toMatchObject({ ok: true });
  });

  it("sem mudança de fato não gasta versão", async () => {
    const { id } = (await criarTarefa(banco, italo, completa())) as { id: string };
    expect(await editarTarefa(banco, ana, id, 1, { titulo: "Fechar hotel de Maceió", prioridade: "alta" })).toEqual({ ok: true, versao: 1 });
  });
});

describe("etapas", () => {
  it("triagem só libera completa; depois segue a máquina de estados", async () => {
    const { id } = (await criarTarefa(banco, ana, { ...completa(), prazo: null })) as { id: string };
    expect(await mudarEtapa(banco, italo, id, 1, "a_fazer")).toMatchObject({ ok: false, motivo: "Defina prazo antes de liberar." });
    await editarTarefa(banco, italo, id, 1, { prazo: "2026-10-02" });
    expect(await mudarEtapa(banco, italo, id, 2, "a_fazer")).toMatchObject({ ok: true, versao: 3 });
    expect(await mudarEtapa(banco, ana, id, 3, "concluida")).toMatchObject({ ok: false }); // pula etapa
    expect(await mudarEtapa(banco, ana, id, 3, "em_andamento")).toMatchObject({ ok: true });
    expect(await mudarEtapa(banco, ana, id, 4, "concluida")).toMatchObject({ ok: true }); // frente sem revisão
  });

  it("frente com revisão passa por 'em revisão'", async () => {
    const { id } = (await criarTarefa(banco, italo, { ...completa(), frenteId: frenteRevisaoId })) as { id: string };
    await mudarEtapa(banco, ana, id, 1, "em_andamento");
    expect(await mudarEtapa(banco, ana, id, 2, "concluida")).toMatchObject({ ok: false });
    expect(await mudarEtapa(banco, ana, id, 2, "em_revisao")).toMatchObject({ ok: true });
  });

  it("bloqueio exige motivo e desbloqueio volta à etapa anterior", async () => {
    const { id } = (await criarTarefa(banco, italo, completa())) as { id: string };
    await mudarEtapa(banco, ana, id, 1, "em_andamento");
    expect(await mudarEtapa(banco, ana, id, 2, "bloqueada", "  ")).toMatchObject({ ok: false });
    expect(await mudarEtapa(banco, ana, id, 2, "bloqueada", "Esperando contrato")).toMatchObject({ ok: true });
    const [b] = await banco.select().from(tarefas).where(eq(tarefas.id, id));
    expect(b).toMatchObject({ estado: "bloqueada", estadoAnterior: "em_andamento", motivoBloqueio: "Esperando contrato" });
    expect(await mudarEtapa(banco, italo, id, 3, "em_andamento")).toMatchObject({ ok: true });
    const [d] = await banco.select().from(tarefas).where(eq(tarefas.id, id));
    expect(d).toMatchObject({ estado: "em_andamento", estadoAnterior: null, motivoBloqueio: null });
    expect((await eventos(id)).map((e) => e.depois)).toContain("bloqueada — Esperando contrato");
  });

  it("id inválido não quebra", async () => {
    expect(await mudarEtapa(banco, ana, "xyz", 1, "a_fazer")).toMatchObject({ ok: false, motivo: "Tarefa não encontrada." });
  });
});

describe("arquivar", () => {
  it("arquiva e desfaz voltando à etapa de antes", async () => {
    const { id } = (await criarTarefa(banco, italo, completa())) as { id: string };
    await mudarEtapa(banco, ana, id, 1, "em_andamento");
    expect(await arquivarTarefa(banco, ana, id, 2)).toMatchObject({ ok: true, versao: 3 });
    expect(await editarTarefa(banco, ana, id, 3, { prioridade: "baixa" })).toMatchObject({ ok: false });
    expect(await desarquivarTarefa(banco, italo, id, 3)).toMatchObject({ ok: true, estado: "em_andamento" });
  });

  it("se o responsável perdeu o acesso, desarquivar manda pra triagem sem dono", async () => {
    const { id } = (await criarTarefa(banco, italo, completa())) as { id: string };
    await arquivarTarefa(banco, italo, id, 1);
    await banco.update(usuarios).set({ ativo: false, acessoRemovidoEm: new Date() }).where(eq(usuarios.id, ana.id));
    expect(await desarquivarTarefa(banco, italo, id, 2)).toMatchObject({ ok: true, estado: "triagem" });
    const [t] = await banco.select().from(tarefas).where(eq(tarefas.id, id));
    expect(t.responsavelId).toBeNull();
  });
});

describe("comentários e checklist", () => {
  it("comentar, adicionar, marcar e remover ficam no histórico sem gastar versão", async () => {
    const { id } = (await criarTarefa(banco, italo, completa())) as { id: string };
    expect(await comentar(banco, ana, id, "  Já cotei dois hotéis  ")).toEqual({ ok: true });
    expect(await comentar(banco, ana, id, "   ")).toMatchObject({ ok: false });
    expect(await adicionarItem(banco, ana, id, "Cotar")).toEqual({ ok: true });
    expect(await adicionarItem(banco, ana, id, "Reservar")).toEqual({ ok: true });

    let d = await detalharTarefa(banco, id);
    expect(d?.comentarios[0]).toMatchObject({ autor: "Ana", texto: "Já cotei dois hotéis" });
    const [cotar, reservar] = d!.checklist;
    expect(await alternarItem(banco, italo, cotar.id)).toEqual({ ok: true, concluido: true });
    expect(await removerItem(banco, italo, reservar.id)).toEqual({ ok: true });

    d = await detalharTarefa(banco, id);
    expect(d?.checklist).toEqual([{ id: cotar.id, texto: "Cotar", concluido: true }]);
    expect(d?.versao).toBe(1);
    expect((await eventos(id)).map((e) => e.depois)).toEqual([
      "Pedida manualmente",
      "Já cotei dois hotéis",
      "Adicionou: Cotar",
      "Adicionou: Reservar",
      "Marcou: Cotar",
      "Removeu: Reservar",
    ]);
  });
});
