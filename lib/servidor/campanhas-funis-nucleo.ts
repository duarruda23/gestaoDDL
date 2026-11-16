import { asc, eq, inArray, max } from "drizzle-orm";
import type { Banco } from "@/db";
import { campanhaFunil, funisCampanha } from "@/db/schema";
import { podeVerCampanhas } from "./permissoes";
import type { ContaDaSessao } from "./sessao-nucleo";
import type { Atribuicao, FunilCadastro, PapelFunil } from "./campanhas-nucleo";

// Agrupamento de campanhas em funis, salvo no banco da gestão. Só gestor mexe
// (mesma regra da aba). A sugestão por nome vem do Dashboard-italo; o que se salva
// aqui vale por cima dela.

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; motivo: string };

const PAPEIS: PapelFunil[] = ["entrada", "etapa", "backend", "complemento"];
const MAX_LOTE = 200;

export async function listarFunis(banco: Banco): Promise<FunilCadastro[]> {
  const linhas = await banco.select().from(funisCampanha).orderBy(asc(funisCampanha.ordem), asc(funisCampanha.rotulo));
  return linhas.map((f) => ({ chave: f.chave, rotulo: f.rotulo, papel: f.papel as PapelFunil, ordem: f.ordem }));
}

export async function listarAtribuicoes(banco: Banco): Promise<Atribuicao[]> {
  const linhas = await banco
    .select({
      metaCampaignId: campanhaFunil.metaCampaignId,
      chave: funisCampanha.chave,
      foraDoEscopo: campanhaFunil.foraDoEscopo,
    })
    .from(campanhaFunil)
    .leftJoin(funisCampanha, eq(funisCampanha.id, campanhaFunil.funilId));
  return linhas.map((l) => ({ metaCampaignId: l.metaCampaignId, funil: l.chave, foraDoEscopo: l.foraDoEscopo }));
}

export type Destino = { tipo: "funil"; chave: string } | { tipo: "fora" } | { tipo: "sugestao" };

// `conhecidas` é o que o Dashboard-italo realmente tem (id da Meta -> nome): o app nunca
// grava um id que a fonte não conhece, nem confia no nome vindo do formulário.
export async function agruparCampanhas(
  banco: Banco,
  conta: ContaDaSessao,
  ids: string[],
  destino: Destino,
  conhecidas: Map<string, string>
): Promise<Resultado<{ alteradas: number }>> {
  if (!podeVerCampanhas(conta)) return { ok: false, motivo: "Só gestores mexem no agrupamento de campanhas." };
  const unicos = [...new Set(ids.map((i) => i.trim()).filter(Boolean))];
  if (!unicos.length) return { ok: false, motivo: "Marque ao menos uma campanha." };
  if (unicos.length > MAX_LOTE) return { ok: false, motivo: `Marque no máximo ${MAX_LOTE} campanhas por vez.` };
  const desconhecidas = unicos.filter((i) => !conhecidas.has(i));
  if (desconhecidas.length) return { ok: false, motivo: "Alguma campanha marcada não existe mais na fonte. Recarregue a página." };

  return banco.transaction(async (tx) => {
    if (destino.tipo === "sugestao") {
      await tx.delete(campanhaFunil).where(inArray(campanhaFunil.metaCampaignId, unicos));
      return { ok: true as const, alteradas: unicos.length };
    }

    let funilId: string | null = null;
    if (destino.tipo === "funil") {
      const [f] = await tx.select({ id: funisCampanha.id }).from(funisCampanha).where(eq(funisCampanha.chave, destino.chave)).limit(1);
      if (!f) return { ok: false as const, motivo: "Esse funil não existe." };
      funilId = f.id;
    }
    const agora = new Date();
    for (const id of unicos) {
      const valores = {
        funilId,
        foraDoEscopo: destino.tipo === "fora",
        nomeNaEpoca: (conhecidas.get(id) ?? "").slice(0, 300),
        definidoPor: conta.id,
        atualizadoEm: agora,
      };
      await tx
        .insert(campanhaFunil)
        .values({ metaCampaignId: id, ...valores })
        .onConflictDoUpdate({ target: campanhaFunil.metaCampaignId, set: valores });
    }
    return { ok: true as const, alteradas: unicos.length };
  });
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function chaveDoRotulo(rotulo: string): string {
  return semAcento(rotulo).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export async function criarFunil(
  banco: Banco,
  conta: ContaDaSessao,
  dados: { rotulo: string; papel?: string }
): Promise<Resultado<{ chave: string }>> {
  if (!podeVerCampanhas(conta)) return { ok: false, motivo: "Só gestores criam funis." };
  const rotulo = dados.rotulo.trim().replace(/\s+/g, " ");
  if (rotulo.length < 2 || rotulo.length > 80) return { ok: false, motivo: "Dê ao funil um nome de 2 a 80 caracteres." };
  const papel = (dados.papel ?? "entrada") as PapelFunil;
  if (!PAPEIS.includes(papel)) return { ok: false, motivo: "Tipo de funil inválido." };
  const base = chaveDoRotulo(rotulo);
  if (!base) return { ok: false, motivo: "Use letras ou números no nome do funil." };

  return banco.transaction(async (tx) => {
    const existentes = await tx.select({ chave: funisCampanha.chave, rotulo: funisCampanha.rotulo }).from(funisCampanha);
    if (existentes.some((e) => e.rotulo.toLowerCase() === rotulo.toLowerCase())) {
      return { ok: false as const, motivo: "Já existe um funil com esse nome." };
    }
    let chave = base;
    for (let n = 2; existentes.some((e) => e.chave === chave); n += 1) chave = `${base}_${n}`;
    const [{ maior }] = await tx.select({ maior: max(funisCampanha.ordem) }).from(funisCampanha);
    await tx.insert(funisCampanha).values({ chave, rotulo, papel, ordem: (maior ?? 0) + 1 });
    return { ok: true as const, chave };
  });
}
