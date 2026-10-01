import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { Banco } from "@/db";
import { anexos, eventosTarefa, tarefas, usuarios } from "@/db/schema";
import type { Resultado } from "./tarefas-nucleo";

// D2 — anexos: arquivos (guardados num volume da VPS, fora do banco) e links.
// O banco guarda só os metadados (spec, seção 8). Modelo horizontal: qualquer
// conta anexa e remove, e tudo fica no histórico da tarefa.
//
// Segurança: o nome no disco é sempre <tarefa>/<uuid>, nunca o nome enviado;
// só tipos da lista abaixo; o download exige sessão e sai como anexo com
// nosniff, então nada enviado é executado pelo navegador.

type Ator = { id: string };
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TAMANHO_MAXIMO = 8 * 1024 * 1024; // 8 MB
export const MAX_ANEXOS_POR_TAREFA = 30;

export const TIPOS_PERMITIDOS: Record<string, string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "application/pdf": ["pdf"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
};

export function pastaAnexos(): string {
  return process.env.ANEXOS_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".anexos");
}

function caminhoDe(chave: string): string {
  // Só aceita a forma gerada aqui; qualquer outra coisa não chega ao disco.
  const [t, a, ...resto] = chave.split("/");
  if (resto.length || !FORMATO_UUID.test(t) || !FORMATO_UUID.test(a)) throw new Error("Chave de anexo inválida.");
  return path.join(/*turbopackIgnore: true*/ pastaAnexos(), t, a);
}

function limparNome(nome: string): string {
  const base = nome.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f"]/g, "").trim();
  return (base || "arquivo").slice(0, 150);
}

async function conferirTarefa(banco: Banco, tarefaId: string): Promise<string | null> {
  if (!FORMATO_UUID.test(tarefaId)) return "Tarefa não encontrada.";
  const [t] = await banco.select({ estado: tarefas.estado }).from(tarefas).where(eq(tarefas.id, tarefaId)).limit(1);
  if (!t) return "Tarefa não encontrada.";
  if (t.estado === "arquivada") return "Tarefa arquivada.";
  const quantos = await banco.select({ id: anexos.id }).from(anexos).where(eq(anexos.tarefaId, tarefaId));
  if (quantos.length >= MAX_ANEXOS_POR_TAREFA) return `A tarefa já tem ${MAX_ANEXOS_POR_TAREFA} anexos. Remova algum antes.`;
  return null;
}

export async function enviarArquivo(
  banco: Banco,
  ator: Ator,
  tarefaId: string,
  arquivo: { nome: string; tipo: string; bytes: Uint8Array }
): Promise<Resultado<{ id: string }>> {
  const nome = limparNome(arquivo.nome);
  if (!arquivo.bytes.byteLength) return { ok: false, motivo: "Arquivo vazio." };
  if (arquivo.bytes.byteLength > TAMANHO_MAXIMO) return { ok: false, motivo: "Arquivo acima de 8 MB. Envie um link (Drive, por exemplo)." };
  const extensoes = TIPOS_PERMITIDOS[arquivo.tipo];
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  if (!extensoes || !extensoes.includes(ext))
    return { ok: false, motivo: "Tipo de arquivo não aceito. Use imagem, PDF, planilha, documento ou apresentação." };
  const recusa = await conferirTarefa(banco, tarefaId);
  if (recusa) return { ok: false, motivo: recusa };

  const id = randomUUID();
  const chave = `${tarefaId}/${id}`;
  const destino = caminhoDe(chave);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, arquivo.bytes, { flag: "wx" });
  try {
    await banco.transaction(async (tx) => {
      await tx.insert(anexos).values({ id, tarefaId, autorId: ator.id, nome, chaveObjeto: chave, tipo: arquivo.tipo, tamanhoBytes: arquivo.bytes.byteLength });
      await tx.insert(eventosTarefa).values({ tarefaId, tipo: "anexo", atorId: ator.id, depois: `Anexou ${nome}` });
    });
  } catch (erro) {
    await rm(destino, { force: true }); // sem registro no banco, o arquivo não fica órfão
    throw erro;
  }
  return { ok: true, id };
}

export async function adicionarLink(banco: Banco, ator: Ator, tarefaId: string, dados: { url: string; nome?: string }): Promise<Resultado<{ id: string }>> {
  let url: URL;
  try {
    url = new URL(dados.url.trim());
  } catch {
    return { ok: false, motivo: "Link inválido." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, motivo: "Use um link que comece com https://." };
  if (url.href.length > 2000) return { ok: false, motivo: "Link longo demais." };
  const recusa = await conferirTarefa(banco, tarefaId);
  if (recusa) return { ok: false, motivo: recusa };
  const nome = limparNome(dados.nome?.trim() || url.hostname);
  const id = await banco.transaction(async (tx) => {
    const [a] = await tx.insert(anexos).values({ tarefaId, autorId: ator.id, nome, url: url.href }).returning({ id: anexos.id });
    await tx.insert(eventosTarefa).values({ tarefaId, tipo: "anexo", atorId: ator.id, depois: `Anexou o link ${nome}` });
    return a.id;
  });
  return { ok: true, id };
}

export async function removerAnexo(banco: Banco, ator: Ator, anexoId: string): Promise<Resultado<{ tarefaId: string }>> {
  if (!FORMATO_UUID.test(anexoId)) return { ok: false, motivo: "Anexo não encontrado." };
  const removido = await banco.transaction(async (tx) => {
    const [a] = await tx.delete(anexos).where(eq(anexos.id, anexoId)).returning();
    if (!a) return null;
    await tx.insert(eventosTarefa).values({ tarefaId: a.tarefaId, tipo: "anexo", atorId: ator.id, depois: `Removeu o anexo ${a.nome}` });
    return a;
  });
  if (!removido) return { ok: false, motivo: "Anexo não encontrado." };
  if (removido.chaveObjeto) await rm(caminhoDe(removido.chaveObjeto), { force: true });
  return { ok: true, tarefaId: removido.tarefaId };
}

export interface AnexoVisao {
  id: string;
  nome: string;
  tipo: string | null;
  tamanhoBytes: number | null;
  url: string | null; // link externo; arquivo baixa por /api/anexos/<id>
  autor: string;
  criadoEm: string;
}

export async function listarAnexos(banco: Banco, tarefaId: string): Promise<AnexoVisao[]> {
  const linhas = await banco
    .select({ id: anexos.id, nome: anexos.nome, tipo: anexos.tipo, tamanhoBytes: anexos.tamanhoBytes, url: anexos.url, autor: usuarios.nome, criadoEm: anexos.criadoEm })
    .from(anexos)
    .innerJoin(usuarios, eq(usuarios.id, anexos.autorId))
    .where(eq(anexos.tarefaId, tarefaId))
    .orderBy(asc(anexos.criadoEm));
  return linhas.map((l) => ({ ...l, criadoEm: l.criadoEm.toISOString() }));
}

export async function lerArquivo(banco: Banco, anexoId: string): Promise<{ nome: string; tipo: string; bytes: Buffer } | null> {
  if (!FORMATO_UUID.test(anexoId)) return null;
  const [a] = await banco.select().from(anexos).where(eq(anexos.id, anexoId)).limit(1);
  if (!a?.chaveObjeto || !a.tipo) return null;
  try {
    return { nome: a.nome, tipo: a.tipo, bytes: await readFile(caminhoDe(a.chaveObjeto)) };
  } catch {
    return null;
  }
}
