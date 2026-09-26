import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { sessoes, usuarios } from "@/db/schema";
import {
  DURACAO_SESSAO_MS,
  apagarSessoesVencidas,
  criarSessao,
  encerrarSessao,
  hashDoToken,
  validarSessao,
} from "@/lib/servidor/sessao-nucleo";
import { rotaPublica } from "@/lib/servidor/cookie";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// A1 — critérios de aceite da sessão (plano da Fase 4).

let banco: Banco;
let pg: PGlite;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
});
beforeEach(async () => {
  await limparBanco(pg);
});

describe("sessão", () => {
  it("token válido devolve a conta dona da sessão", async () => {
    const conta = await criarConta(banco, { nome: "Ana" });
    const { token } = await criarSessao(banco, conta.id, "teste");
    const achada = await validarSessao(banco, token);
    expect(achada?.id).toBe(conta.id);
    expect(achada?.nome).toBe("Ana");
  });

  it("o banco guarda só o hash do token, nunca o token", async () => {
    const conta = await criarConta(banco);
    const { token } = await criarSessao(banco, conta.id, null);
    const linhas = await banco.select().from(sessoes);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].tokenHash).toBe(hashDoToken(token));
    expect(linhas[0].tokenHash).not.toContain(token);
  });

  it("sem token, token inventado ou token gigante: sem conta", async () => {
    expect(await validarSessao(banco, undefined)).toBeNull();
    expect(await validarSessao(banco, "")).toBeNull();
    expect(await validarSessao(banco, "token-que-nao-existe")).toBeNull();
    expect(await validarSessao(banco, "x".repeat(500))).toBeNull();
  });

  it("sessão vencida não entra", async () => {
    const conta = await criarConta(banco);
    const ontem = new Date(Date.now() - DURACAO_SESSAO_MS - 24 * 3600 * 1000);
    const { token } = await criarSessao(banco, conta.id, null, ontem);
    expect(await validarSessao(banco, token)).toBeNull();
    expect(await apagarSessoesVencidas(banco)).toBe(1);
  });

  it("remover o acesso derruba a sessão na hora (trigger + segunda barreira)", async () => {
    const dono = await criarConta(banco, { dono: true, gerenciaAcessos: true });
    const conta = await criarConta(banco);
    const { token } = await criarSessao(banco, conta.id, null);
    expect(await validarSessao(banco, token)).not.toBeNull();

    await banco
      .update(usuarios)
      .set({ ativo: false, acessoRemovidoEm: new Date(), acessoRemovidoPorId: dono.id })
      .where(eq(usuarios.id, conta.id));

    expect(await validarSessao(banco, token)).toBeNull();
    // O trigger do banco apagou a sessão, não só a escondeu.
    expect(await banco.select().from(sessoes).where(eq(sessoes.usuarioId, conta.id))).toHaveLength(0);
  });

  it("usar a sessão depois de 1 hora renova a validade", async () => {
    const conta = await criarConta(banco);
    const inicio = new Date("2026-09-25T12:00:00Z");
    const { token } = await criarSessao(banco, conta.id, null, inicio);
    const duasHorasDepois = new Date(inicio.getTime() + 2 * 3600 * 1000);
    await validarSessao(banco, token, duasHorasDepois);
    const [linha] = await banco.select().from(sessoes);
    expect(linha.expiraEm.getTime()).toBe(duasHorasDepois.getTime() + DURACAO_SESSAO_MS);
  });

  it("sair encerra a sessão", async () => {
    const conta = await criarConta(banco);
    const { token } = await criarSessao(banco, conta.id, null);
    await encerrarSessao(banco, token);
    expect(await validarSessao(banco, token)).toBeNull();
  });
});

describe("limpeza entre testes", () => {
  it("mantém a configuração padrão de cobranças", async () => {
    const { rows } = await pg.query<{ n: number }>("select count(*)::int as n from config_cobranca where id = 1");
    expect(rows[0].n).toBe(1);
  });
});

describe("rotas públicas", () => {
  it("só entrar, convite e a API do n8n funcionam sem sessão", () => {
    expect(rotaPublica("/entrar")).toBe(true);
    expect(rotaPublica("/convite/abc123")).toBe(true);
    expect(rotaPublica("/api/n8n/mensagens")).toBe(true);
    expect(rotaPublica("/")).toBe(false);
    expect(rotaPublica("/quadro")).toBe(false);
    expect(rotaPublica("/equipe")).toBe(false);
    expect(rotaPublica("/api/interpretar")).toBe(false);
    expect(rotaPublica("/entrarfalso")).toBe(false);
  });
});
