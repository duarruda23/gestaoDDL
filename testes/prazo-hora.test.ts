import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosTarefa, frentes, mensagens, tarefas } from "@/db/schema";
import { criarTarefa, editarTarefa } from "@/lib/servidor/tarefas-nucleo";
import { gerarCobrancasAutomaticas } from "@/lib/servidor/regras-cobranca";
import { descreverPrazo, formatarHora, formatarPrazoHistorico, horaAtual } from "@/lib/datas";
import { estaVencida, ordenarPorUrgencia } from "@/lib/regras";
import { interpretarSimulado } from "@/lib/interpretar-simulado";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// Hora do prazo: opcional. Sem hora, o prazo vale até o fim do dia.

const HOJE = "2026-09-25"; // sexta

describe("exibição e regra de vencida", () => {
  it("formata a hora e descreve o prazo com ou sem ela", () => {
    expect(formatarHora("14:00")).toBe("14h");
    expect(formatarHora("09:30")).toBe("9h30");
    expect(descreverPrazo("2026-09-26", HOJE)).toBe("Amanhã");
    expect(descreverPrazo("2026-09-26", HOJE, "14:00")).toBe("Amanhã às 14h");
    expect(formatarPrazoHistorico("2026-10-02 09:30")).toBe("02/10 às 9h30");
    expect(formatarPrazoHistorico("2026-10-02")).toBe("02/10");
    expect(horaAtual(new Date("2026-09-25T15:07:00Z"))).toBe("12:07"); // São Paulo
  });

  it("com hora, vence naquela hora do dia; sem hora, só no dia seguinte", () => {
    const t = { estado: "a_fazer" as const, prazo: HOJE };
    expect(estaVencida({ ...t, prazoHora: "14:00" }, HOJE, "13:59")).toBe(false);
    expect(estaVencida({ ...t, prazoHora: "14:00" }, HOJE, "14:00")).toBe(true);
    expect(estaVencida({ ...t, prazoHora: null }, HOJE, "23:59")).toBe(false);
    expect(estaVencida({ ...t, prazoHora: null }, "2026-09-26", "00:01")).toBe(true);
  });

  it("no mesmo dia, a com hora mais cedo vem antes; sem hora fica no fim do dia", () => {
    const base = { prazo: HOJE, prioridade: "media" as const };
    const lista = [
      { ...base, prazoHora: null, n: "sem hora" },
      { ...base, prazoHora: "16:00", n: "16h" },
      { ...base, prazoHora: "09:00", n: "9h" },
    ].sort(ordenarPorUrgencia);
    expect(lista.map((x) => x.n)).toEqual(["9h", "16h", "sem hora"]);
  });

  it("o interpretador por regras pega a hora quando o pedido diz", () => {
    const r = interpretarSimulado("Ana, grava os stories até sexta às 14h30", HOJE, [], []);
    expect(r.propostas[0]).toMatchObject({ prazo: HOJE, prazo_hora: "14:30" });
    const s = interpretarSimulado("Ana, grava os stories amanhã", HOJE, [], []);
    expect(s.propostas[0].prazo_hora).toBeNull();
  });
});

let banco: Banco;
let pg: PGlite;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
});

let italo: Awaited<ReturnType<typeof criarConta>>;
let ana: Awaited<ReturnType<typeof criarConta>>;
let frenteId: string;
beforeEach(async () => {
  await limparBanco(pg);
  italo = await criarConta(banco, { nome: "Ítalo", dono: true, gerenciaAcessos: true });
  ana = await criarConta(banco, { nome: "Ana" });
  [{ id: frenteId }] = await banco.insert(frentes).values({ nome: "Eventos" }).returning();
});

const dados = (prazo: string | null, prazoHora: string | null = null) => ({
  titulo: "Stories do evento",
  descricao: "",
  responsavelId: ana.id,
  prazo,
  prazoHora,
  frenteId,
  prioridade: "media" as const,
});

async function criar(prazo: string | null, prazoHora: string | null = null) {
  const r = await criarTarefa(banco, italo, dados(prazo, prazoHora));
  if (!r.ok) throw new Error(r.motivo);
  return r.id;
}

const ler = async (id: string) => (await banco.select().from(tarefas).where(eq(tarefas.id, id)))[0];

describe("gravar a hora", () => {
  it("cria com e sem hora; o aviso de atribuição cita a hora", async () => {
    const com = await criar("2026-10-02", "14:00");
    const sem = await criar("2026-10-02");
    expect((await ler(com)).prazoHora).toBe("14:00");
    expect((await ler(sem)).prazoHora).toBeNull();
    const [aviso] = await banco.select().from(mensagens).where(eq(mensagens.tarefaId, com));
    expect(aviso.texto).toContain("às 14h");
  });

  it("recusa hora inválida", async () => {
    const r = await criarTarefa(banco, italo, dados("2026-10-02", "25:00"));
    expect(r).toMatchObject({ ok: false, motivo: "Hora do prazo inválida." });
  });

  it("mudar só a hora fica no histórico; apagar a data apaga a hora", async () => {
    const id = await criar("2026-10-02", "14:00");
    expect(await editarTarefa(banco, italo, id, 1, { prazoHora: "09:30" })).toMatchObject({ ok: true });
    const [ev] = await banco.select().from(eventosTarefa).where(eq(eventosTarefa.tipo, "prazo"));
    expect(ev).toMatchObject({ antes: "2026-10-02 14:00", depois: "2026-10-02 09:30" });

    // Uma tarefa liberada precisa de prazo; na triagem dá pra apagar.
    const triagem = await criar(null);
    expect((await ler(triagem)).estado).toBe("triagem");
    expect(await editarTarefa(banco, italo, triagem, 1, { prazo: "2026-10-02", prazoHora: "10:00" })).toMatchObject({ ok: true });
    await banco.update(tarefas).set({ estado: "triagem" }).where(eq(tarefas.id, triagem));
    const v = (await ler(triagem)).versao;
    expect(await editarTarefa(banco, italo, triagem, v, { prazo: null })).toMatchObject({ ok: true });
    expect(await ler(triagem)).toMatchObject({ prazo: null, prazoHora: null });
  });
});

describe("cobranças com hora", () => {
  it("véspera cita a hora; vencida sai no mesmo dia depois do horário", async () => {
    await criar("2026-09-26", "14:00");
    const hoje14 = await criar(HOJE, "14:00");
    await banco.delete(mensagens);

    await gerarCobrancasAutomaticas(banco, HOJE, "13:00");
    let fila = await banco.select().from(mensagens);
    expect(fila.map((m) => m.texto)).toEqual(["Ana, lembrete: *Stories do evento* vence amanhã às 14h."]);

    await gerarCobrancasAutomaticas(banco, HOJE, "15:00");
    fila = await banco.select().from(mensagens).where(eq(mensagens.tarefaId, hoje14));
    expect(fila).toHaveLength(1);
    expect(fila[0].regra).toBe("vencida");
    expect(fila[0].texto).toContain("venceu hoje às 14h");
  });
});
