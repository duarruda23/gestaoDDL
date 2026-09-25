import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { configCobranca, eventosTarefa, frentes, mensagens, usuarios } from "@/db/schema";
import { cobrancasRecebidas, cobrarTarefa, definirPausa, listarMensagens } from "@/lib/servidor/cobranca-nucleo";
import { criarTarefa, mudarEtapa } from "@/lib/servidor/tarefas-nucleo";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// Cobrança manual: todos cobram todos (inclusive o Ítalo), uma por dia por
// autor, e tudo vai para a fila de mensagens.

let banco: Banco;
let pg: PGlite;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
});

const HOJE = "2026-09-25";
let italo: Awaited<ReturnType<typeof criarConta>>;
let ana: Awaited<ReturnType<typeof criarConta>>;
let diego: Awaited<ReturnType<typeof criarConta>>;
let tarefaDaAna: string;
let tarefaDoItalo: string;

beforeEach(async () => {
  await limparBanco(pg);
  italo = await criarConta(banco, { nome: "Ítalo Souza", dono: true, gerenciaAcessos: true });
  ana = await criarConta(banco, { nome: "Ana Lima" });
  diego = await criarConta(banco, { nome: "Diego" });
  const [f] = await banco.insert(frentes).values({ nome: "Eventos" }).returning();
  const base = { descricao: "", frenteId: f.id, prioridade: "media" as const };
  tarefaDaAna = ((await criarTarefa(banco, italo, { ...base, titulo: "Vídeos", responsavelId: ana.id, prazo: "2026-09-23" })) as { id: string }).id;
  tarefaDoItalo = ((await criarTarefa(banco, ana, { ...base, titulo: "Aprovar roteiro", responsavelId: italo.id, prazo: "2026-09-26" })) as { id: string }).id;
});

describe("cobrar", () => {
  it("o Ítalo cobra a Ana e a Ana cobra o Ítalo; texto, fila e histórico", async () => {
    const r1 = await cobrarTarefa(banco, italo, tarefaDaAna, " Preciso hoje ", HOJE);
    expect(r1).toEqual({ ok: true, status: "pendente", destinatario: "Ana Lima" });
    const r2 = await cobrarTarefa(banco, ana, tarefaDoItalo, "", HOJE);
    expect(r2).toMatchObject({ ok: true, status: "pendente" });

    const fila = await listarMensagens(banco);
    const praAna = fila.find((m) => m.destinatario.id === ana.id)!;
    expect(praAna.texto).toBe("Ana, Ítalo está cobrando: *Vídeos*. Venceu há 2 dias. Preciso hoje");
    expect(praAna.autor?.nome).toBe("Ítalo Souza");
    expect(fila.find((m) => m.destinatario.id === italo.id)?.texto).toContain("Prazo: amanhã.");

    const [ev] = await banco.select().from(eventosTarefa).where(eq(eventosTarefa.tipo, "cobranca")).orderBy(eventosTarefa.id);
    expect(ev).toMatchObject({ atorId: italo.id, depois: 'Cobrou Ana Lima: "Preciso hoje"' });
  });

  it("uma por dia por autor; outra pessoa ainda pode cobrar", async () => {
    await cobrarTarefa(banco, italo, tarefaDaAna, "", HOJE);
    expect(await cobrarTarefa(banco, italo, tarefaDaAna, "de novo", HOJE)).toMatchObject({ ok: false });
    expect(await cobrarTarefa(banco, diego, tarefaDaAna, "", HOJE)).toMatchObject({ ok: true });
    expect(await cobrarTarefa(banco, italo, tarefaDaAna, "", "2026-09-26")).toMatchObject({ ok: true });
  });

  it("não cobra a si mesmo, tarefa sem dono, concluída ou de quem perdeu o acesso", async () => {
    expect(await cobrarTarefa(banco, ana, tarefaDaAna, "", HOJE)).toMatchObject({ ok: false });
    await mudarEtapa(banco, ana, tarefaDaAna, 1, "em_andamento");
    await mudarEtapa(banco, ana, tarefaDaAna, 2, "concluida");
    expect(await cobrarTarefa(banco, italo, tarefaDaAna, "", HOJE)).toMatchObject({ ok: false, motivo: "A tarefa já foi concluída ou arquivada." });
    await banco.update(usuarios).set({ ativo: false, acessoRemovidoEm: new Date() }).where(eq(usuarios.id, diego.id));
    const t = (await criarTarefa(banco, italo, { titulo: "X", descricao: "", responsavelId: null, prazo: null, frenteId: null, prioridade: "media" })) as { id: string };
    expect(await cobrarTarefa(banco, ana, t.id, "", HOJE)).toMatchObject({ ok: false });
    expect(await cobrarTarefa(banco, ana, "invalido", "", HOJE)).toMatchObject({ ok: false });
  });

  it("pausada ou sem WhatsApp: registra mas não sai", async () => {
    await definirPausa(banco, ana.id, true);
    expect(await cobrarTarefa(banco, italo, tarefaDaAna, "", HOJE)).toMatchObject({ ok: true, status: "ignorado" });
    await banco.update(usuarios).set({ telefoneWhatsapp: "" }).where(eq(usuarios.id, italo.id));
    expect(await cobrarTarefa(banco, ana, tarefaDoItalo, "", HOJE)).toMatchObject({ ok: true, status: "ignorado" });
    const fila = await listarMensagens(banco);
    expect(fila.map((m) => m.motivo).sort()).toEqual(["Ana pausou as cobranças no WhatsApp.", "Ítalo ainda não cadastrou o WhatsApp."]);
  });

  it("respeita o limite diário de quem recebe", async () => {
    await banco.update(configCobranca).set({ limiteDiarioPorPessoa: 1 });
    expect(await cobrarTarefa(banco, italo, tarefaDaAna, "", HOJE)).toMatchObject({ ok: true });
    // Conta pelo dia de São Paulo em que a mensagem foi criada: usa a data real de hoje.
    const [m] = await banco.select().from(mensagens);
    const hojeReal = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(m.criadoEm);
    await banco.delete(mensagens);
    await cobrarTarefa(banco, italo, tarefaDaAna, "", hojeReal);
    expect(await cobrarTarefa(banco, diego, tarefaDaAna, "", hojeReal)).toMatchObject({ ok: false });
  });

  it("Início: cobranças recebidas", async () => {
    await cobrarTarefa(banco, italo, tarefaDaAna, "", HOJE);
    const hojeReal = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const r = await cobrancasRecebidas(banco, ana.id, 7, hojeReal);
    expect(r.map((m) => [m.autor?.nome, m.tarefa?.titulo])).toEqual([["Ítalo Souza", "Vídeos"]]);
  });
});
