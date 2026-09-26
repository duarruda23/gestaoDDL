import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosTarefa, frentes, pedidosEntrada, propostasIa, tarefaEnvolvidos, tarefas } from "@/db/schema";
import type { ProvedorIA } from "@/lib/provedor-ia";
import type { RespostaIA } from "@/lib/interpretacao";
import {
  apagarTextosVencidos,
  confirmarProposta,
  descartarProposta,
  interpretarPedido,
  propostasAbertas,
  resumoAuditoria,
} from "@/lib/servidor/pedidos-nucleo";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// Bloco B: texto livre → propostas guardadas → revisão → tarefa.

let banco: Banco;
let pg: PGlite;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
});

const HOJE = "2026-09-25";
let italo: Awaited<ReturnType<typeof criarConta>>;
let ana: Awaited<ReturnType<typeof criarConta>>;
let diego: Awaited<ReturnType<typeof criarConta>>;
let conteudo: string;
let eventos: string;

beforeEach(async () => {
  await limparBanco(pg);
  italo = await criarConta(banco, { nome: "Ítalo Souza", dono: true, gerenciaAcessos: true });
  ana = await criarConta(banco, { nome: "Ana Lima", funcao: "Vídeos" });
  diego = await criarConta(banco, { nome: "Diego" });
  const [c, e] = await banco.insert(frentes).values([{ nome: "Conteúdo e redes" }, { nome: "Eventos presenciais" }]).returning();
  conteudo = c.id;
  eventos = e.id;
});

// IA falsa: devolve o que o teste mandar e guarda o prompt recebido.
function iaFalsa(resposta: (system: string) => RespostaIA | Error): ProvedorIA & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    provedor: "openai",
    modelo: "modelo-de-teste",
    prompts,
    async interpretar(system) {
      prompts.push(system);
      const r = resposta(system);
      if (r instanceof Error) throw r;
      return r;
    },
    descreverErro: (e) => (e instanceof Error ? e.message : "erro"),
  };
}

const proposta = (extra: Partial<RespostaIA["propostas"][number]>): RespostaIA["propostas"][number] => ({
  titulo: "Gravar três vídeos",
  descricao: "",
  frente_id: conteudo,
  responsavel_id: ana.id,
  envolvidos_ids: [],
  prazo: "2026-09-26",
  prioridade: "alta",
  subtarefas: ["Roteiro", "Gravação"],
  evidencias: [{ campo: "responsavel_id", trecho: "Ana" }],
  inferidos: ["frente_id"],
  ambiguidades: [],
  ...extra,
});

describe("interpretar", () => {
  it("usa a equipe do banco no prompt, guarda o pedido e as propostas", async () => {
    const ia = iaFalsa(() => ({ propostas: [proposta({ envolvidos_ids: [italo.id, "id-inventado"] }), proposta({ titulo: "Fechar hotel", responsavel_id: diego.id, frente_id: eventos })] }));
    const r = await interpretarPedido(banco, italo, "Ana, grava três vídeos até amanhã. Diego fecha o hotel.", ia, HOJE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.modo).toBe("ia");
    expect(r.propostas).toHaveLength(2);
    expect(r.propostas[0].envolvidosIds).toEqual([italo.id]); // ID inventado pela IA não passa
    expect(ia.prompts[0]).toContain(`${ana.id}: Ana Lima — Vídeos`);
    expect(ia.prompts[0]).toContain("Quem está escrevendo este pedido: Ítalo Souza");

    const [pedido] = await banco.select().from(pedidosEntrada);
    expect(pedido).toMatchObject({ autorId: italo.id, modo: "ia", provedor: "openai", modelo: "modelo-de-teste" });
    expect(pedido.apagarTextoEm).not.toBeNull();
    expect(await propostasAbertas(banco, italo.id)).toHaveLength(2);
    expect(await propostasAbertas(banco, ana.id)).toHaveLength(0); // só quem pediu vê
  });

  it("responsável inexistente vira pergunta; IA fora do ar cai nas regras", async () => {
    const r1 = await interpretarPedido(banco, italo, "algo", iaFalsa(() => ({ propostas: [proposta({ responsavel_id: "u-nao-existe" })] })), HOJE);
    expect(r1.ok && r1.propostas[0].responsavelId).toBeNull();
    expect(r1.ok && r1.propostas[0].ambiguidades.join(" ")).toContain("não existe no cadastro");

    const r2 = await interpretarPedido(banco, italo, "Pede pra Ana gravar o vídeo do presencial até sexta", iaFalsa(() => new Error("Sem saldo.")), HOJE);
    expect(r2).toMatchObject({ ok: true, modo: "regras" });
    if (!r2.ok) return;
    expect(r2.aviso).toContain("Sem saldo.");
    expect(r2.propostas[0].responsavelId).toBe(ana.id);
    expect(r2.propostas[0].prazo).toBe("2026-09-25"); // hoje é sexta
  });

  it("sem IA configurada também funciona, e recusa texto vazio", async () => {
    expect(await interpretarPedido(banco, ana, "   ", null, HOJE)).toMatchObject({ ok: false });
    const r = await interpretarPedido(banco, ana, "Diego, fecha o coffee break do evento até dia 5/10", null, HOJE);
    expect(r).toMatchObject({ ok: true, modo: "regras" });
    expect(r.ok && r.propostas[0]).toMatchObject({ responsavelId: diego.id, frenteId: eventos, prazo: "2026-10-05" });
  });
});

describe("revisar", () => {
  it("confirmar cria a tarefa com origem IA, envolvidos e histórico; não confirma duas vezes", async () => {
    const r = await interpretarPedido(banco, italo, "texto", iaFalsa(() => ({ propostas: [proposta({ envolvidos_ids: [diego.id] })] })), HOJE);
    if (!r.ok) throw new Error(r.motivo);
    const p = r.propostas[0];
    const dados = { titulo: p.titulo, descricao: p.descricao, responsavelId: p.responsavelId, prazo: "2026-09-29", frenteId: p.frenteId, prioridade: p.prioridade, itens: p.subtarefas, envolvidosIds: p.envolvidosIds };

    expect(await confirmarProposta(banco, ana, p.id, dados)).toMatchObject({ ok: false }); // não é de quem pediu
    const c = await confirmarProposta(banco, italo, p.id, dados);
    expect(c).toMatchObject({ ok: true, estado: "a_fazer" });
    if (!c.ok) return;

    const [t] = await banco.select().from(tarefas).where(eq(tarefas.id, c.tarefaId));
    expect(t).toMatchObject({ origem: "ia", pedidoId: r.pedidoId, criadorId: italo.id, prazo: "2026-09-29" });
    expect(await banco.select().from(tarefaEnvolvidos)).toEqual([{ tarefaId: t.id, usuarioId: diego.id, papel: "citado" }]);
    const [ev] = await banco.select().from(eventosTarefa).where(eq(eventosTarefa.tarefaId, t.id));
    expect(ev).toMatchObject({ tipo: "confirmada_ia", depois: "Pedida em texto livre, interpretada pela IA e revisada" });

    expect(await confirmarProposta(banco, italo, p.id, dados)).toMatchObject({ ok: false, motivo: "Essa proposta já foi revisada." });
    expect(await propostasAbertas(banco, italo.id)).toHaveLength(0);
  });

  it("descartar tira da lista; auditoria conta aceitas como vieram", async () => {
    const r = await interpretarPedido(banco, italo, "texto", iaFalsa(() => ({ propostas: [proposta({}), proposta({ titulo: "Outra" }), proposta({ titulo: "Terceira" })] })), HOJE);
    if (!r.ok) throw new Error(r.motivo);
    const [a, b, c] = r.propostas;
    const base = (p: typeof a) => ({ titulo: p.titulo, descricao: "", responsavelId: p.responsavelId, prazo: p.prazo, frenteId: p.frenteId, prioridade: p.prioridade });
    await confirmarProposta(banco, italo, a.id, base(a)); // como veio
    await confirmarProposta(banco, italo, b.id, { ...base(b), responsavelId: diego.id }); // mudou quem faz
    expect(await descartarProposta(banco, italo, c.id)).toEqual({ ok: true });

    expect(await resumoAuditoria(banco)).toEqual({ propostas: 3, confirmadas: 2, descartadas: 1, abertas: 0, aceitasComoVieram: 1, porRegras: 0 });
    const [linha] = await banco.select().from(propostasIa).where(eq(propostasIa.id, c.id));
    expect(linha).toMatchObject({ situacao: "descartada", revisadaPorId: italo.id });
  });

  it("retenção apaga só o texto vencido", async () => {
    await interpretarPedido(banco, italo, "texto sensível", null, HOJE);
    expect(await apagarTextosVencidos(banco)).toBe(0);
    expect(await apagarTextosVencidos(banco, new Date(Date.now() + 91 * 86_400_000))).toBe(1);
    const [p] = await banco.select().from(pedidosEntrada);
    expect(p.texto).toBe("");
    expect(await banco.select().from(propostasIa)).toHaveLength(1); // auditoria continua
  });
});
