import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { configCobranca, mensagens, sessoes } from "@/db/schema";
import {
  MAX_PEDIDOS_POR_EMAIL,
  VALIDADE_REDEFINICAO_MS,
  pedirRedefinicao,
} from "@/lib/servidor/recuperacao-nucleo";
import { aceitarConvite, lerConvite } from "@/lib/servidor/convite-nucleo";
import { tentarEntrar } from "@/lib/servidor/login-nucleo";
import { criarSessao } from "@/lib/servidor/sessao-nucleo";
import { registrarResultado, reservarMensagens } from "@/lib/servidor/n8n-nucleo";
import { TEXTO_REDEFINICAO_OCULTO, listarMensagens } from "@/lib/servidor/cobranca-nucleo";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// "Esqueci minha senha": link pelo WhatsApp cadastrado, sem depender de ninguém.

let banco: Banco;
let pg: PGlite;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
});
beforeEach(async () => {
  await limparBanco(pg);
});

const SITE = "https://gestao.exemplo.com";
const MADRUGADA = new Date("2026-09-25T05:00:00Z"); // 2h em São Paulo, fora da janela

function tokenDoTexto(texto: string): string {
  const m = texto.match(/\/convite\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`sem link no texto: ${texto}`);
  return m[1];
}

async function mensagensDe(id: string) {
  return banco.select().from(mensagens).where(eq(mensagens.destinatarioId, id));
}

describe("pedir redefinição de senha", () => {
  it("manda o link no WhatsApp; o link troca a senha e derruba as sessões antigas", async () => {
    const italo = await criarConta(banco, { nome: "Ítalo Souza", email: "italo@exemplo.com", dono: true, gerenciaAcessos: true });
    await criarSessao(banco, italo.id, null);

    expect(await pedirRedefinicao(banco, { email: " ITALO@exemplo.com ", ip: "1.1.1.1", site: SITE })).toBe("enviado");
    const [m] = await mensagensDe(italo.id);
    expect(m.regra).toBe("redefinir_senha");
    expect(m.status).toBe("pendente");
    expect(m.texto).toContain(`${SITE}/convite/`);
    expect(m.texto.startsWith("Ítalo,")).toBe(true);

    const token = tokenDoTexto(m.texto);
    expect((await lerConvite(banco, token)).contaExistente).toBe(true);
    expect((await aceitarConvite(banco, token, "senha-nova-do-italo")).ok).toBe(true);
    expect((await tentarEntrar(banco, { email: "italo@exemplo.com", senha: "senha-nova-do-italo", ip: "1.1.1.1" })).ok).toBe(true);
    expect(await banco.select().from(sessoes).where(eq(sessoes.usuarioId, italo.id))).toHaveLength(0);
  });

  it("e-mail sem conta, conta sem acesso ou sem WhatsApp: nada é enviado", async () => {
    await criarConta(banco, { email: "sem@exemplo.com", telefoneWhatsapp: "" });
    await criarConta(banco, { email: "fora@exemplo.com", ativo: false, acessoRemovidoEm: new Date() });
    expect(await pedirRedefinicao(banco, { email: "ninguem@exemplo.com", ip: "1.1.1.1", site: SITE })).toBe("sem_conta");
    expect(await pedirRedefinicao(banco, { email: "fora@exemplo.com", ip: "1.1.1.1", site: SITE })).toBe("sem_conta");
    expect(await pedirRedefinicao(banco, { email: "sem@exemplo.com", ip: "1.1.1.1", site: SITE })).toBe("sem_whatsapp");
    expect(await banco.select().from(mensagens)).toHaveLength(0);
  });

  it("um pedido novo invalida o link anterior", async () => {
    const ana = await criarConta(banco, { email: "ana@exemplo.com" });
    await pedirRedefinicao(banco, { email: "ana@exemplo.com", ip: "1.1.1.1", site: SITE });
    const agora2 = new Date(Date.now() + 1000);
    await pedirRedefinicao(banco, { email: "ana@exemplo.com", ip: "1.1.1.1", site: SITE }, agora2);
    const [primeira, segunda] = (await mensagensDe(ana.id)).sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
    expect((await lerConvite(banco, tokenDoTexto(primeira.texto), agora2)).situacao).toBe("vencido");
    expect((await lerConvite(banco, tokenDoTexto(segunda.texto), agora2)).situacao).toBe("valido");
  });

  it("o link vence em 1 hora", async () => {
    const ana = await criarConta(banco, { email: "ana@exemplo.com" });
    await pedirRedefinicao(banco, { email: "ana@exemplo.com", ip: "1.1.1.1", site: SITE });
    const [m] = await mensagensDe(ana.id);
    const depois = new Date(Date.now() + VALIDADE_REDEFINICAO_MS + 60_000);
    expect((await lerConvite(banco, tokenDoTexto(m.texto), depois)).situacao).toBe("vencido");
  });

  it("limita pedidos por e-mail e por IP", async () => {
    const ana = await criarConta(banco, { email: "ana@exemplo.com" });
    for (let i = 0; i < MAX_PEDIDOS_POR_EMAIL; i++) {
      expect(await pedirRedefinicao(banco, { email: "ana@exemplo.com", ip: `9.9.9.${i}`, site: SITE })).toBe("enviado");
    }
    expect(await pedirRedefinicao(banco, { email: "ana@exemplo.com", ip: "8.8.8.8", site: SITE })).toBe("limite");
    expect(await mensagensDe(ana.id)).toHaveLength(MAX_PEDIDOS_POR_EMAIL);

    for (let i = 0; i < 10; i++) await pedirRedefinicao(banco, { email: `x${i}@exemplo.com`, ip: "7.7.7.7", site: SITE });
    await criarConta(banco, { email: "bia@exemplo.com" });
    expect(await pedirRedefinicao(banco, { email: "bia@exemplo.com", ip: "7.7.7.7", site: SITE })).toBe("limite");
  });
});

describe("envio do link pelo n8n", () => {
  it("sai de madrugada, com cobranças desligadas e pausadas; cobrança comum continua esperando", async () => {
    const ana = await criarConta(banco, { email: "ana@exemplo.com", cobrancaPausada: true });
    await banco.update(configCobranca).set({ ativa: false });
    await pedirRedefinicao(banco, { email: "ana@exemplo.com", ip: "1.1.1.1", site: SITE }, MADRUGADA);
    await banco.insert(mensagens).values({
      chave: "outra",
      tarefaId: null,
      regra: "resumo_diario",
      autorId: null,
      destinatarioId: ana.id,
      texto: "resumo",
      agendadaPara: MADRUGADA,
    });

    const r = await reservarMensagens(banco, 20, MADRUGADA);
    expect(r.mensagens).toHaveLength(1);
    expect(r.mensagens[0].texto).toContain("/convite/");
    const [resumo] = await banco.select().from(mensagens).where(eq(mensagens.chave, "outra"));
    expect(resumo.status).toBe("pendente");
  });

  it("sem link pendente, fora da janela continua dizendo o motivo", async () => {
    const r = await reservarMensagens(banco, 20, MADRUGADA);
    expect(r.mensagens).toHaveLength(0);
    expect(r.motivo).toContain("janela");
  });

  it("o link nunca aparece pra equipe e sai do banco depois de enviado", async () => {
    const ana = await criarConta(banco, { email: "ana@exemplo.com" });
    await pedirRedefinicao(banco, { email: "ana@exemplo.com", ip: "1.1.1.1", site: SITE }, MADRUGADA);
    const [visao] = await listarMensagens(banco);
    expect(visao.texto).toBe(TEXTO_REDEFINICAO_OCULTO);

    const { mensagens: [m] } = await reservarMensagens(banco, 20, MADRUGADA);
    expect((await registrarResultado(banco, { id: m.id, ok: true, idProvedor: "abc" })).ok).toBe(true);
    const [gravada] = await mensagensDe(ana.id);
    expect(gravada.status).toBe("enviado");
    expect(gravada.texto).not.toContain("/convite/");
  });
});
