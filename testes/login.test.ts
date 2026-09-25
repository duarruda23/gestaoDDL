import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosAcesso, usuarios } from "@/db/schema";
import { conferirSenha, gerarHashDeSenha, problemaNaSenha } from "@/lib/servidor/senha";
import { MAX_FALHAS, destinoSeguro, tentarEntrar } from "@/lib/servidor/login-nucleo";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// A2 — critérios de aceite do login (plano da Fase 4).

let banco: Banco;
let pg: PGlite;
let hashDaSenhaBoa: string;
const SENHA = "donas-de-loja-2026";

beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
  hashDaSenhaBoa = await gerarHashDeSenha(SENHA); // scrypt é lento de propósito: calcula uma vez
});
beforeEach(async () => {
  await limparBanco(pg);
});

describe("senha", () => {
  it("confere a senha certa e recusa a errada", async () => {
    expect(await conferirSenha(SENHA, hashDaSenhaBoa)).toBe(true);
    expect(await conferirSenha("outra-senha-qualquer", hashDaSenhaBoa)).toBe(false);
    expect(await conferirSenha(SENHA, null)).toBe(false);
    expect(await conferirSenha(SENHA, "formato-invalido")).toBe(false);
  });

  it("o hash não contém a senha e muda a cada geração (sal)", async () => {
    const outro = await gerarHashDeSenha(SENHA);
    expect(hashDaSenhaBoa).not.toContain(SENHA);
    expect(outro).not.toBe(hashDaSenhaBoa);
    expect(hashDaSenhaBoa).toMatch(/^scrypt\$\d+\$8\$1\$[^$]+\$[^$]+$/);
  });

  it("regras mínimas de senha", () => {
    expect(problemaNaSenha("curta")).not.toBeNull();
    expect(problemaNaSenha("aaaaaaaaaaaa")).not.toBeNull();
    expect(problemaNaSenha(SENHA)).toBeNull();
  });
});

describe("entrar", () => {
  it("e-mail e senha certos entram (sem diferenciar maiúsculas no e-mail)", async () => {
    const conta = await criarConta(banco, { email: "ana@exemplo.com", senhaHash: hashDaSenhaBoa });
    const r = await tentarEntrar(banco, { email: "  ANA@Exemplo.com ", senha: SENHA, ip: "1.1.1.1" });
    expect(r).toEqual({ ok: true, usuarioId: conta.id });
    const [evento] = await banco.select().from(eventosAcesso).where(eq(eventosAcesso.tipo, "login"));
    expect(evento.atorId).toBe(conta.id);
  });

  it("senha errada e e-mail inexistente dão a MESMA resposta", async () => {
    await criarConta(banco, { email: "ana@exemplo.com", senhaHash: hashDaSenhaBoa });
    const senhaErrada = await tentarEntrar(banco, { email: "ana@exemplo.com", senha: "errada-errada", ip: "1.1.1.1" });
    const semConta = await tentarEntrar(banco, { email: "ninguem@exemplo.com", senha: SENHA, ip: "1.1.1.1" });
    expect(senhaErrada).toEqual({ ok: false, motivo: "credenciais" });
    expect(semConta).toEqual({ ok: false, motivo: "credenciais" });
  });

  it("conta sem senha definida (convite não aceito) não entra", async () => {
    await criarConta(banco, { email: "nova@exemplo.com", senhaHash: null });
    const r = await tentarEntrar(banco, { email: "nova@exemplo.com", senha: SENHA, ip: "1.1.1.1" });
    expect(r).toEqual({ ok: false, motivo: "credenciais" });
  });

  it(`a ${MAX_FALHAS + 1}ª tentativa é bloqueada, mesmo com a senha certa`, async () => {
    await criarConta(banco, { email: "ana@exemplo.com", senhaHash: hashDaSenhaBoa });
    for (let i = 0; i < MAX_FALHAS; i++) {
      await tentarEntrar(banco, { email: "ana@exemplo.com", senha: `errada-${i}-xxxxx`, ip: `10.0.0.${i}` });
    }
    const r = await tentarEntrar(banco, { email: "ana@exemplo.com", senha: SENHA, ip: "10.0.0.99" });
    expect(r).toEqual({ ok: false, motivo: "bloqueado" });
  });

  it("muitas falhas do mesmo IP bloqueiam aquele IP em qualquer e-mail", async () => {
    await criarConta(banco, { email: "ana@exemplo.com", senhaHash: hashDaSenhaBoa });
    for (let i = 0; i < MAX_FALHAS; i++) {
      await tentarEntrar(banco, { email: `alvo${i}@exemplo.com`, senha: "errada-errada", ip: "6.6.6.6" });
    }
    expect(await tentarEntrar(banco, { email: "ana@exemplo.com", senha: SENHA, ip: "6.6.6.6" })).toEqual({
      ok: false,
      motivo: "bloqueado",
    });
    // Outro IP, com a senha certa, entra normalmente.
    expect((await tentarEntrar(banco, { email: "ana@exemplo.com", senha: SENHA, ip: "7.7.7.7" })).ok).toBe(true);
  });

  it("o bloqueio acaba depois de 15 minutos", async () => {
    await criarConta(banco, { email: "ana@exemplo.com", senhaHash: hashDaSenhaBoa });
    const antes = new Date("2026-09-25T12:00:00Z");
    for (let i = 0; i < MAX_FALHAS; i++) {
      await tentarEntrar(banco, { email: "ana@exemplo.com", senha: "errada-errada", ip: "1.1.1.1" }, antes);
    }
    const depois = new Date(antes.getTime() + 16 * 60 * 1000);
    expect((await tentarEntrar(banco, { email: "ana@exemplo.com", senha: SENHA, ip: "1.1.1.1" }, depois)).ok).toBe(true);
  });

  it("conta com acesso removido: acertando a senha, recebe o motivo (e não entra)", async () => {
    const dono = await criarConta(banco, { dono: true, gerenciaAcessos: true });
    const conta = await criarConta(banco, { email: "saiu@exemplo.com", senhaHash: hashDaSenhaBoa });
    await banco
      .update(usuarios)
      .set({ ativo: false, acessoRemovidoEm: new Date(), acessoRemovidoPorId: dono.id })
      .where(eq(usuarios.id, conta.id));
    expect(await tentarEntrar(banco, { email: "saiu@exemplo.com", senha: SENHA, ip: "1.1.1.1" })).toEqual({
      ok: false,
      motivo: "sem_acesso",
    });
    // Com a senha errada, não revela que a conta existe.
    expect(await tentarEntrar(banco, { email: "saiu@exemplo.com", senha: "errada-errada", ip: "1.1.1.2" })).toEqual({
      ok: false,
      motivo: "credenciais",
    });
  });
});

describe("para onde voltar depois de entrar", () => {
  it("aceita só caminhos internos", () => {
    expect(destinoSeguro("/quadro")).toBe("/quadro");
    expect(destinoSeguro("/tarefa/abc?x=1")).toBe("/tarefa/abc?x=1");
    expect(destinoSeguro(null)).toBe("/");
    expect(destinoSeguro("https://golpe.com")).toBe("/");
    expect(destinoSeguro("//golpe.com")).toBe("/");
    expect(destinoSeguro("/\\golpe.com")).toBe("/");
    expect(destinoSeguro("/entrar")).toBe("/");
  });
});
