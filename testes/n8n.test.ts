import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { configCobranca, frentes, mensagens, usuarios } from "@/db/schema";
import { criarTarefa } from "@/lib/servidor/tarefas-nucleo";
import { gerarCobrancasAutomaticas } from "@/lib/servidor/regras-cobranca";
import { normalizarTelefone, registrarResultado, reenviarMensagem, reservarMensagens } from "@/lib/servidor/n8n-nucleo";
import { autorizarN8n } from "@/lib/servidor/n8n-auth";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// Bloco C: regras automáticas e o ciclo reservar → resultado do n8n.

let banco: Banco;
let pg: PGlite;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
});

const HOJE = "2026-09-25";
const MEIO_DIA = new Date("2026-09-25T15:00:00Z"); // 12h em São Paulo
const MADRUGADA = new Date("2026-09-25T05:00:00Z"); // 2h em São Paulo
let italo: Awaited<ReturnType<typeof criarConta>>;
let ana: Awaited<ReturnType<typeof criarConta>>;
let frenteId: string;

beforeEach(async () => {
  await limparBanco(pg);
  italo = await criarConta(banco, { nome: "Ítalo", dono: true, gerenciaAcessos: true, telefoneWhatsapp: "+55 81 99719-2362" });
  ana = await criarConta(banco, { nome: "Ana" });
  [{ id: frenteId }] = await banco.insert(frentes).values({ nome: "Eventos" }).returning();
});

async function tarefa(titulo: string, prazo: string, responsavelId = ana.id, criador = italo) {
  const r = await criarTarefa(banco, criador, { titulo, descricao: "", responsavelId, prazo, frenteId, prioridade: "media" });
  return (r as { id: string }).id;
}

const fila = () => banco.select().from(mensagens).orderBy(mensagens.criadoEm);

// As mensagens nascem agendadas para o relógio real; os testes simulam
// "meio-dia de 25/09", então a fila é trazida para antes disso.
async function tarefaNaFila(titulo: string, prazo: string) {
  const id = await tarefa(titulo, prazo);
  await banco.update(mensagens).set({ agendadaPara: new Date(MEIO_DIA.getTime() - 60_000) });
  return id;
}

describe("regras automáticas", () => {
  it("véspera, vencida e aviso a quem pediu; rodar de novo não duplica", async () => {
    await tarefa("Amanhã", "2026-09-26");
    await tarefa("Ontem", "2026-09-24");
    await tarefa("Três dias", "2026-09-22");
    await tarefa("Semana que vem", "2026-10-02");
    await banco.delete(mensagens); // tira os avisos de atribuição

    expect(await gerarCobrancasAutomaticas(banco, HOJE)).toEqual({ novas: 4, ignoradas: 0, jaExistiam: 0 });
    const m = await fila();
    const por = (regra: string) => m.filter((x) => x.regra === regra).map((x) => x.texto);
    expect(por("prazo_proximo")).toEqual(["Ana, lembrete: *Amanhã* vence amanhã."]);
    expect(por("vencida").sort()).toEqual([
      "Ana, *Ontem* (pedido de Ítalo) venceu ontem. Consegue atualizar o andamento no sistema?",
      "Ana, *Três dias* (pedido de Ítalo) venceu há 3 dias. Consegue atualizar o andamento no sistema?",
    ]);
    expect(m.find((x) => x.regra === "escalonamento")).toMatchObject({
      destinatarioId: italo.id,
      texto: "Ítalo, o que você pediu pra Ana (*Três dias*) está vencido há 3 dias.",
    });

    expect(await gerarCobrancasAutomaticas(banco, HOJE)).toEqual({ novas: 0, ignoradas: 0, jaExistiam: 4 });
  });

  it("desligada na configuração não gera nada", async () => {
    await tarefa("Ontem", "2026-09-24");
    await banco.update(configCobranca).set({ ativa: false });
    expect(await gerarCobrancasAutomaticas(banco, HOJE)).toEqual({ novas: 0, ignoradas: 0, jaExistiam: 0 });
  });
});

describe("ciclo com o n8n", () => {
  it("reserva, confirma envio e não entrega a mesma mensagem duas vezes", async () => {
    await tarefaNaFila("Vídeos", "2026-10-02"); // gera o aviso de atribuição pra Ana
    const r1 = await reservarMensagens(banco, 10, MEIO_DIA);
    expect(r1.mensagens).toHaveLength(1);
    expect(r1.mensagens[0].telefone).toMatch(/^55\d{10,11}$/);
    expect((await reservarMensagens(banco, 10, MEIO_DIA)).mensagens).toHaveLength(0); // já reservada

    const id = r1.mensagens[0].id;
    expect(await registrarResultado(banco, { id, ok: true, idProvedor: "wamid.1" }, MEIO_DIA)).toEqual({ ok: true, status: "enviado" });
    expect(await registrarResultado(banco, { id, ok: true }, MEIO_DIA)).toEqual({ ok: true, status: "enviado" }); // repetir é seguro
    const [m] = await fila();
    expect(m).toMatchObject({ status: "enviado", idProvedor: "wamid.1", tentativas: 1 });
  });

  it("fora da janela não entrega nada", async () => {
    await tarefaNaFila("Vídeos", "2026-10-02");
    const r = await reservarMensagens(banco, 10, MADRUGADA);
    expect(r.mensagens).toHaveLength(0);
    expect(r.motivo).toContain("janela");
  });

  it("falha tenta de novo mais tarde e desiste na 3ª; reenviar põe de volta na fila", async () => {
    await tarefaNaFila("Vídeos", "2026-10-02");
    let agora = MEIO_DIA;
    for (let i = 1; i <= 3; i++) {
      const [m] = (await reservarMensagens(banco, 10, agora)).mensagens;
      expect(m).toBeDefined();
      const r = await registrarResultado(banco, { id: m.id, ok: false, erro: "Número não existe" }, agora);
      expect(r).toEqual({ ok: true, status: i < 3 ? "pendente" : "falhou" });
      agora = new Date(agora.getTime() + 20 * 60_000);
    }
    const [falhou] = await fila();
    expect(falhou).toMatchObject({ status: "falhou", motivo: "Número não existe" });
    expect(await reenviarMensagem(banco, falhou.id, agora)).toMatchObject({ ok: true });
    expect((await reservarMensagens(banco, 10, agora)).mensagens).toHaveLength(1);
  });

  it("reserva vencida sem resposta volta a ser entregue", async () => {
    await tarefaNaFila("Vídeos", "2026-10-02");
    const [m] = (await reservarMensagens(banco, 10, MEIO_DIA)).mensagens;
    const depois = new Date(MEIO_DIA.getTime() + 6 * 60_000);
    expect((await reservarMensagens(banco, 10, depois)).mensagens.map((x) => x.id)).toEqual([m.id]);
  });

  it("quem pausou depois de entrar na fila não recebe", async () => {
    await tarefaNaFila("Vídeos", "2026-10-02");
    await banco.update(usuarios).set({ cobrancaPausada: true }).where(eq(usuarios.id, ana.id));
    expect((await reservarMensagens(banco, 10, MEIO_DIA)).mensagens).toHaveLength(0);
    const [m] = await fila();
    expect(m).toMatchObject({ status: "ignorado", motivo: "Ana pausou as cobranças no WhatsApp." });
  });
});

describe("autenticação do n8n", () => {
  const original = process.env.N8N_TOKEN;
  afterEach(() => {
    process.env.N8N_TOKEN = original;
  });
  const req = (auth?: string) => new Request("http://x/api/n8n/reservar", { method: "POST", headers: auth ? { authorization: auth } : {} });

  it("sem token configurado fica desligada; token errado é recusado; certo passa", () => {
    delete process.env.N8N_TOKEN;
    expect(autorizarN8n(req("Bearer qualquer"))?.status).toBe(503);
    process.env.N8N_TOKEN = "a".repeat(64);
    expect(autorizarN8n(req())?.status).toBe(401);
    expect(autorizarN8n(req("Bearer " + "b".repeat(64)))?.status).toBe(401);
    expect(autorizarN8n(req("Bearer " + "a".repeat(64)))).toBeNull();
  });

  it("telefone vira só dígitos com DDI", () => {
    expect(normalizarTelefone("+55 81 99719-2362")).toBe("5581997192362");
    expect(normalizarTelefone("(81) 99719-2362")).toBe("5581997192362");
  });
});
