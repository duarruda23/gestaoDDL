import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosAcesso, sessoes, usuarios } from "@/db/schema";
import { VALIDADE_CONVITE_MS, aceitarConvite, criarConvite, lerConvite } from "@/lib/servidor/convite-nucleo";
import { tentarEntrar } from "@/lib/servidor/login-nucleo";
import { criarSessao } from "@/lib/servidor/sessao-nucleo";
import { recusaParaMexerNoAcesso } from "@/lib/servidor/permissoes";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// A3/A4 — convites e as regras de acesso do servidor.

let banco: Banco;
let pg: PGlite;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
});
beforeEach(async () => {
  await limparBanco(pg);
});

const NOVA = { nome: "Bruno", email: "bruno@exemplo.com", telefoneWhatsapp: "+55 82 90000-0007" };
const SENHA = "senha-do-bruno-123";

describe("convite de conta nova", () => {
  it("qualquer pessoa da equipe convida; o link cria a conta e dá pra entrar", async () => {
    const ana = await criarConta(banco, { nome: "Ana" });
    const c = await criarConvite(banco, ana, NOVA);
    expect(c.ok && c.tipo).toBe("conta_nova");
    if (!c.ok) return;

    expect((await lerConvite(banco, c.token)).situacao).toBe("valido");
    const aceito = await aceitarConvite(banco, c.token, SENHA);
    expect(aceito.ok).toBe(true);

    const [bruno] = await banco.select().from(usuarios).where(eq(usuarios.email, "bruno@exemplo.com"));
    expect(bruno.nome).toBe("Bruno");
    expect(bruno.criadoPorId).toBe(ana.id);
    expect((await tentarEntrar(banco, { email: "bruno@exemplo.com", senha: SENHA, ip: "1.1.1.1" })).ok).toBe(true);

    const tipos = (await banco.select({ tipo: eventosAcesso.tipo }).from(eventosAcesso)).map((e) => e.tipo);
    expect(tipos).toEqual(expect.arrayContaining(["convite_criado", "conta_criada"]));
  });

  it("o mesmo link não funciona duas vezes", async () => {
    const ana = await criarConta(banco);
    const c = await criarConvite(banco, ana, NOVA);
    if (!c.ok) throw new Error(c.motivo);
    expect((await aceitarConvite(banco, c.token, SENHA)).ok).toBe(true);
    expect((await aceitarConvite(banco, c.token, "outra-senha-qualquer")).ok).toBe(false);
    expect((await lerConvite(banco, c.token)).situacao).toBe("usado");
  });

  it("link vencido (mais de 72h) é recusado", async () => {
    const ana = await criarConta(banco);
    const ontem = new Date(Date.now() - VALIDADE_CONVITE_MS - 60_000);
    const c = await criarConvite(banco, ana, NOVA, ontem);
    if (!c.ok) throw new Error(c.motivo);
    expect((await lerConvite(banco, c.token)).situacao).toBe("vencido");
    expect((await aceitarConvite(banco, c.token, SENHA)).ok).toBe(false);
  });

  it("senha fraca não aceita o convite (e o link continua valendo)", async () => {
    const ana = await criarConta(banco);
    const c = await criarConvite(banco, ana, NOVA);
    if (!c.ok) throw new Error(c.motivo);
    expect((await aceitarConvite(banco, c.token, "curta")).ok).toBe(false);
    expect((await lerConvite(banco, c.token)).situacao).toBe("valido");
  });

  it("valida nome, e-mail e WhatsApp", async () => {
    const ana = await criarConta(banco);
    expect((await criarConvite(banco, ana, { ...NOVA, nome: " " })).ok).toBe(false);
    expect((await criarConvite(banco, ana, { ...NOVA, email: "sem-arroba" })).ok).toBe(false);
    expect((await criarConvite(banco, ana, { ...NOVA, telefoneWhatsapp: "123" })).ok).toBe(false);
  });
});

describe("convite para conta que já existe (redefinir senha)", () => {
  it("pessoa comum NÃO pode: senão tomaria a conta de outra pessoa", async () => {
    const ana = await criarConta(banco, { nome: "Ana" });
    await criarConta(banco, { email: "vitima@exemplo.com" });
    const r = await criarConvite(banco, ana, { ...NOVA, email: "VITIMA@exemplo.com" });
    expect(r.ok).toBe(false);
  });

  it("o dono pode; a senha nova vale e as sessões antigas caem", async () => {
    const dono = await criarConta(banco, { dono: true, gerenciaAcessos: true });
    const vitoria = await criarConta(banco, { email: "vitoria@exemplo.com", senhaHash: "scrypt$1$1$1$x$y" });
    await criarSessao(banco, vitoria.id, null);

    const c = await criarConvite(banco, dono, { nome: "Vitória", email: "vitoria@exemplo.com", telefoneWhatsapp: "+55 82 90000-0005" });
    expect(c.ok && c.tipo).toBe("redefinir_senha");
    if (!c.ok) return;
    expect((await aceitarConvite(banco, c.token, SENHA)).ok).toBe(true);

    expect((await tentarEntrar(banco, { email: "vitoria@exemplo.com", senha: SENHA, ip: "1.1.1.1" })).ok).toBe(true);
    expect(await banco.select().from(sessoes).where(eq(sessoes.usuarioId, vitoria.id))).toHaveLength(0);
    // Não criou uma segunda conta com o mesmo e-mail.
    expect(await banco.select().from(usuarios).where(eq(usuarios.email, "vitoria@exemplo.com"))).toHaveLength(1);
  });

  it("conta sem acesso não recebe convite nem pelo dono", async () => {
    const dono = await criarConta(banco, { dono: true, gerenciaAcessos: true });
    await criarConta(banco, {
      email: "saiu@exemplo.com",
      ativo: false,
      acessoRemovidoEm: new Date(),
      acessoRemovidoPorId: dono.id,
    });
    expect((await criarConvite(banco, dono, { ...NOVA, email: "saiu@exemplo.com" })).ok).toBe(false);
  });
});

describe("quem pode mexer em acessos", () => {
  const base = { ativo: true, dono: false, gerenciaAcessos: false };
  const dono = { ...base, id: "dono", dono: true, gerenciaAcessos: true };
  const gestora = { ...base, id: "gestora", gerenciaAcessos: true };
  const outraGestora = { ...base, id: "outra", gerenciaAcessos: true };
  const comum = { ...base, id: "comum" };
  const alvo = { ...base, id: "alvo" };

  it("dono e gestora podem; pessoa comum não", () => {
    expect(recusaParaMexerNoAcesso(dono, alvo)).toBeNull();
    expect(recusaParaMexerNoAcesso(gestora, alvo)).toBeNull();
    expect(recusaParaMexerNoAcesso(comum, alvo)).not.toBeNull();
  });

  it("ninguém mexe no dono, nem em si mesmo; só o dono mexe em outra gestora", () => {
    expect(recusaParaMexerNoAcesso(gestora, dono)).not.toBeNull();
    expect(recusaParaMexerNoAcesso(gestora, gestora)).not.toBeNull();
    expect(recusaParaMexerNoAcesso(gestora, outraGestora)).not.toBeNull();
    expect(recusaParaMexerNoAcesso(dono, outraGestora)).toBeNull();
  });

  it("quem perdeu o acesso não mexe em nada", () => {
    expect(recusaParaMexerNoAcesso({ ...gestora, ativo: false }, alvo)).not.toBeNull();
  });
});
