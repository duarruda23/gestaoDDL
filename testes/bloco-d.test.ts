import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { eventosTarefa, frentes, mensagens } from "@/db/schema";
import { criarTarefa, adicionarItem } from "@/lib/servidor/tarefas-nucleo";
import { aplicarModelo, arquivarModelo, criarModelo, listarModelos, modeloDaTarefa } from "@/lib/servidor/modelos-nucleo";
import { adicionarLink, enviarArquivo, lerArquivo, listarAnexos, removerAnexo } from "@/lib/servidor/anexos-nucleo";
import { gerarResumoDiario } from "@/lib/servidor/regras-cobranca";
import { detalharTarefa } from "@/lib/servidor/consultas";
import { criarBancoDeTeste, criarConta, limparBanco } from "./banco";

// Bloco D: modelos de checklist, anexos e resumo diário.

let banco: Banco;
let pg: PGlite;
let pasta: string;
beforeAll(async () => {
  ({ banco, pg } = await criarBancoDeTeste());
  pasta = await mkdtemp(path.join(tmpdir(), "anexos-"));
  process.env.ANEXOS_DIR = pasta;
});
afterAll(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const HOJE = "2026-09-25";
let italo: Awaited<ReturnType<typeof criarConta>>;
let ana: Awaited<ReturnType<typeof criarConta>>;
let frenteId: string;
let tarefaId: string;

beforeEach(async () => {
  await limparBanco(pg);
  italo = await criarConta(banco, { nome: "Ítalo", dono: true, gerenciaAcessos: true });
  ana = await criarConta(banco, { nome: "Ana" });
  [{ id: frenteId }] = await banco.insert(frentes).values({ nome: "Eventos" }).returning();
  const r = await criarTarefa(banco, italo, { titulo: "Presencial Maceió", descricao: "", responsavelId: ana.id, prazo: "2026-09-24", frenteId, prioridade: "alta" });
  tarefaId = (r as { id: string }).id;
});

describe("modelos de checklist", () => {
  it("cria, aplica sem repetir itens, salva checklist como modelo e arquiva", async () => {
    const m = await criarModelo(banco, ana, { nome: "Pré-evento", itens: ["Hotel", " Coffee break ", "", "Credenciamento"], frenteId });
    expect(m).toMatchObject({ ok: true });
    expect(await criarModelo(banco, italo, { nome: "pré-evento", itens: ["x"] })).toMatchObject({ ok: false }); // nome repetido
    expect(await criarModelo(banco, italo, { nome: "Vazio", itens: [" "] })).toMatchObject({ ok: false });

    await adicionarItem(banco, ana, tarefaId, "hotel"); // já existe, com outra caixa
    const id = (m as { id: string }).id;
    expect(await aplicarModelo(banco, italo, tarefaId, id)).toEqual({ ok: true, adicionados: 2 });
    const d = await detalharTarefa(banco, tarefaId);
    expect(d?.checklist.map((c) => c.texto)).toEqual(["hotel", "Coffee break", "Credenciamento"]);
    expect(d?.eventos[0].depois).toBe('Aplicou o modelo "Pré-evento" (2 itens novos)');

    expect(await modeloDaTarefa(banco, ana, tarefaId, "Presencial completo")).toMatchObject({ ok: true });
    expect((await listarModelos(banco)).map((x) => x.nome)).toEqual(["Pré-evento", "Presencial completo"]);
    expect(await arquivarModelo(banco, id)).toEqual({ ok: true });
    expect((await listarModelos(banco)).map((x) => x.nome)).toEqual(["Presencial completo"]);
    // Arquivado libera o nome.
    expect(await criarModelo(banco, italo, { nome: "Pré-evento", itens: ["Hotel"] })).toMatchObject({ ok: true });
  });
});

describe("anexos", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

  it("envia arquivo, lista, baixa e remove (do disco também), com histórico", async () => {
    const r = await enviarArquivo(banco, ana, tarefaId, { nome: "../../etc/arte final.png", tipo: "image/png", bytes: png });
    expect(r).toMatchObject({ ok: true });
    const id = (r as { id: string }).id;
    const [a] = await listarAnexos(banco, tarefaId);
    expect(a).toMatchObject({ nome: ".._.._etc_arte final.png", autor: "Ana", tamanhoBytes: 7, url: null });
    expect(await readdir(path.join(pasta, tarefaId))).toEqual([id]); // nome no disco é só o id

    const lido = await lerArquivo(banco, id);
    expect(lido?.tipo).toBe("image/png");
    expect(Array.from(lido!.bytes)).toEqual(Array.from(png));

    expect(await removerAnexo(banco, italo, id)).toMatchObject({ ok: true });
    expect(await readdir(path.join(pasta, tarefaId))).toEqual([]);
    const ev = await banco.select().from(eventosTarefa).where(eq(eventosTarefa.tipo, "anexo"));
    expect(ev.map((e) => e.depois)).toEqual([".._.._etc_arte final.png"].map((n) => `Anexou ${n}`).concat([`Removeu o anexo .._.._etc_arte final.png`]));
  });

  it("recusa tipo não aceito, extensão trocada, arquivo grande e link sem http", async () => {
    expect(await enviarArquivo(banco, ana, tarefaId, { nome: "x.html", tipo: "text/html", bytes: png })).toMatchObject({ ok: false });
    expect(await enviarArquivo(banco, ana, tarefaId, { nome: "x.exe", tipo: "image/png", bytes: png })).toMatchObject({ ok: false });
    expect(await enviarArquivo(banco, ana, tarefaId, { nome: "x.png", tipo: "image/png", bytes: new Uint8Array(8 * 1024 * 1024 + 1) })).toMatchObject({ ok: false });
    expect(await adicionarLink(banco, ana, tarefaId, { url: "javascript:alert(1)" })).toMatchObject({ ok: false });
    const l = await adicionarLink(banco, ana, tarefaId, { url: "https://drive.google.com/abc" });
    expect(l).toMatchObject({ ok: true });
    expect((await listarAnexos(banco, tarefaId))[0]).toMatchObject({ nome: "drive.google.com", url: "https://drive.google.com/abc" });
  });
});

describe("resumo diário", () => {
  it("uma mensagem por pessoa com o que importa; quem não tem nada não recebe; não duplica", async () => {
    await criarConta(banco, { nome: "Diego" }); // sem nada em aberto
    await banco.delete(mensagens); // tira o aviso de atribuição
    expect(await gerarResumoDiario(banco, HOJE)).toEqual({ novas: 2, ignoradas: 0, jaExistiam: 0 });
    const m = await banco.select().from(mensagens);
    const texto = (id: string) => m.find((x) => x.destinatarioId === id)?.texto;
    expect(texto(ana.id)).toMatch(/^Bom dia, Ana! 1 tarefa com você, \*1 vencida\*\. Detalhes/);
    expect(texto(italo.id)).toMatch(/^Bom dia, Ítalo! 1 pedido seu está atrasado com outras pessoas\. Detalhes/);
    expect(await gerarResumoDiario(banco, HOJE)).toEqual({ novas: 0, ignoradas: 0, jaExistiam: 2 });
  });
});
