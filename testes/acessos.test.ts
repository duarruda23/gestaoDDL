import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosAcesso, eventosTarefa, frentes, mensagens, sessoes, tarefas, usuarios } from "@/db/schema";
import { atualizarMeusDados, definirGerenciaAcessos, removerAcesso, restaurarAcesso } from "@/lib/servidor/acessos-nucleo";
import { criarSessao, validarSessao } from "@/lib/servidor/sessao-nucleo";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// A5 — critérios de aceite de acessos (plano da Fase 4).

let banco: Banco;
let pg: PGlite;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
});
beforeEach(async () => {
  await limparBanco(pg);
});

async function recarregar(id: string) {
  const [c] = await banco.select().from(usuarios).where(eq(usuarios.id, id));
  return c;
}

describe("remover acesso", () => {
  it("o dono remove: sessão cai na hora, tarefas abertas vão pra triagem, mensagens pendentes param", async () => {
    const italo = await criarConta(banco, { nome: "Ítalo", dono: true, gerenciaAcessos: true });
    const diego = await criarConta(banco, { nome: "Diego" });
    const [frente] = await banco.insert(frentes).values({ nome: "Eventos" }).returning();
    const [aberta] = await banco
      .insert(tarefas)
      .values({ titulo: "Hotel de Maceió", criadorId: italo.id, responsavelId: diego.id, frenteId: frente.id, prazo: "2026-10-01", estado: "a_fazer" })
      .returning();
    const [feita] = await banco
      .insert(tarefas)
      .values({ titulo: "Contrato antigo", criadorId: italo.id, responsavelId: diego.id, frenteId: frente.id, prazo: "2026-09-01", estado: "concluida" })
      .returning();
    await banco.insert(mensagens).values({ chave: "x", tarefaId: aberta.id, regra: "vencida", destinatarioId: diego.id, texto: "..." });
    const { token } = await criarSessao(banco, diego.id, null);

    const r = await removerAcesso(banco, italo, diego.id, "Saiu da equipe");
    expect(r.ok).toBe(true);

    expect((await recarregar(diego.id)).ativo).toBe(false);
    expect(await validarSessao(banco, token)).toBeNull();
    expect(await banco.select().from(sessoes).where(eq(sessoes.usuarioId, diego.id))).toHaveLength(0);

    const [t1] = await banco.select().from(tarefas).where(eq(tarefas.id, aberta.id));
    expect(t1.estado).toBe("triagem");
    expect(t1.responsavelId).toBeNull();
    const [t2] = await banco.select().from(tarefas).where(eq(tarefas.id, feita.id));
    expect(t2.estado).toBe("concluida"); // concluída fica como estava, com o nome de quem fez
    expect(t2.responsavelId).toBe(diego.id);

    expect((await banco.select().from(eventosTarefa).where(eq(eventosTarefa.tarefaId, aberta.id)))[0].tipo).toBe("acesso");
    expect((await banco.select().from(mensagens))[0].status).toBe("ignorado");
    const [evento] = await banco.select().from(eventosAcesso).where(eq(eventosAcesso.tipo, "acesso_removido"));
    expect(evento.motivo).toBe("Saiu da equipe");
    expect(evento.atorId).toBe(italo.id);
  });

  it("pessoa comum não remove ninguém", async () => {
    const ana = await criarConta(banco);
    const bruno = await criarConta(banco);
    expect((await removerAcesso(banco, ana, bruno.id, "")).ok).toBe(false);
    expect((await recarregar(bruno.id)).ativo).toBe(true);
  });

  it("ninguém remove o dono; ninguém remove a si mesmo", async () => {
    const italo = await criarConta(banco, { dono: true, gerenciaAcessos: true });
    const scarlett = await criarConta(banco, { gerenciaAcessos: true });
    expect((await removerAcesso(banco, scarlett, italo.id, "")).ok).toBe(false);
    expect((await removerAcesso(banco, scarlett, scarlett.id, "")).ok).toBe(false);
    expect((await removerAcesso(banco, italo, italo.id, "")).ok).toBe(false);
  });

  it("gestora remove pessoa comum, mas não outra gestora (só o dono)", async () => {
    const italo = await criarConta(banco, { dono: true, gerenciaAcessos: true });
    const scarlett = await criarConta(banco, { gerenciaAcessos: true });
    const larissa = await criarConta(banco, { gerenciaAcessos: true });
    const vitoria = await criarConta(banco);
    expect((await removerAcesso(banco, scarlett, vitoria.id, "")).ok).toBe(true);
    expect((await removerAcesso(banco, scarlett, larissa.id, "")).ok).toBe(false);
    expect((await removerAcesso(banco, italo, larissa.id, "")).ok).toBe(true);
    // Ao perder o acesso, perde também a permissão de gerenciar acessos.
    expect((await recarregar(larissa.id)).gerenciaAcessos).toBe(false);
  });
});

describe("restaurar acesso", () => {
  it("volta a entrar; pessoa comum não restaura", async () => {
    const italo = await criarConta(banco, { dono: true, gerenciaAcessos: true });
    const ana = await criarConta(banco);
    const diego = await criarConta(banco);
    await removerAcesso(banco, italo, diego.id, "");
    expect((await restaurarAcesso(banco, ana, diego.id)).ok).toBe(false);
    expect((await restaurarAcesso(banco, italo, diego.id)).ok).toBe(true);
    const d = await recarregar(diego.id);
    expect(d.ativo).toBe(true);
    expect(d.acessoRemovidoEm).toBeNull();
  });
});

describe("permissão de gerenciar acessos", () => {
  it("só o dono dá e tira; fica na auditoria", async () => {
    const italo = await criarConta(banco, { dono: true, gerenciaAcessos: true });
    const scarlett = await criarConta(banco);
    const ana = await criarConta(banco, { gerenciaAcessos: true });
    expect((await definirGerenciaAcessos(banco, ana, scarlett.id, true)).ok).toBe(false);
    expect((await definirGerenciaAcessos(banco, italo, scarlett.id, true)).ok).toBe(true);
    expect((await recarregar(scarlett.id)).gerenciaAcessos).toBe(true);
    expect((await definirGerenciaAcessos(banco, italo, scarlett.id, false)).ok).toBe(true);
    const tipos = (await banco.select({ t: eventosAcesso.tipo }).from(eventosAcesso)).map((e) => e.t);
    expect(tipos).toEqual(expect.arrayContaining(["permissao_dada", "permissao_retirada"]));
  });

  it("não se tira a permissão do dono", async () => {
    const italo = await criarConta(banco, { dono: true, gerenciaAcessos: true });
    expect((await definirGerenciaAcessos(banco, italo, italo.id, false)).ok).toBe(false);
  });
});

describe("seus dados", () => {
  it("edita nome, função e WhatsApp; valida o telefone", async () => {
    const eduardo = await criarConta(banco, { telefoneWhatsapp: "" });
    expect((await atualizarMeusDados(banco, eduardo, { nome: "Eduardo", funcao: "Tráfego", telefoneWhatsapp: "123" })).ok).toBe(false);
    expect((await atualizarMeusDados(banco, eduardo, { nome: "Eduardo", funcao: "Tráfego e sistemas", telefoneWhatsapp: "+55 81 99999-0000" })).ok).toBe(true);
    const e = await recarregar(eduardo.id);
    expect(e.funcao).toBe("Tráfego e sistemas");
    expect(e.telefoneWhatsapp).toBe("+55 81 99999-0000");
  });
});
