"use server";

import { revalidatePath } from "next/cache";
import { obterBanco } from "@/db";
import { dashboardItaloConfigurado, obterLeitorDashboardItalo } from "@/db/dashboard-italo";
import { exigirGestor } from "@/lib/servidor/dal";
import { agruparCampanhas, criarFunil, type Destino } from "@/lib/servidor/campanhas-funis-nucleo";

// Server action da aba Agrupar. Começa pela DAL (exigirGestor); as regras ficam no
// núcleo, testado. O nome da campanha vem da fonte, nunca do formulário.

export type EstadoAgrupar = { ok: boolean; mensagem: string | null };

export async function agruparAcao(_: EstadoAgrupar, dados: FormData): Promise<EstadoAgrupar> {
  const conta = await exigirGestor();
  if (!dashboardItaloConfigurado()) return { ok: false, mensagem: "A conexão com o Dashboard-italo não está configurada." };

  const ids = dados.getAll("campanha").map(String);
  const escolha = String(dados.get("destino") ?? "");
  const banco = obterBanco();

  // Valida a seleção antes de criar qualquer funil, para não deixar funil órfão.
  if (!ids.length) return { ok: false, mensagem: "Marque ao menos uma campanha." };

  let conhecidas: Map<string, string>;
  try {
    const linhas = await obterLeitorDashboardItalo().consultar<{ meta_campaign_id: string; nome: string }>(
      "select meta_campaign_id, nome from v_gestao_campanhas"
    );
    conhecidas = new Map(linhas.map((l) => [l.meta_campaign_id, l.nome]));
  } catch {
    return { ok: false, mensagem: "Não consegui ler as campanhas do Dashboard-italo agora. Tente de novo." };
  }

  let destino: Destino;
  if (escolha === "fora") destino = { tipo: "fora" };
  else if (escolha === "sugestao") destino = { tipo: "sugestao" };
  else if (escolha === "novo") {
    const r = await criarFunil(banco, conta, { rotulo: String(dados.get("novoFunil") ?? "") });
    if (!r.ok) return { ok: false, mensagem: r.motivo };
    destino = { tipo: "funil", chave: r.chave };
  } else if (escolha.startsWith("funil:")) destino = { tipo: "funil", chave: escolha.slice(6, 60) };
  else return { ok: false, mensagem: "Escolha para onde levar as campanhas marcadas." };

  const r = await agruparCampanhas(banco, conta, ids, destino, conhecidas);
  if (!r.ok) return { ok: false, mensagem: r.motivo };
  revalidatePath("/campanhas");
  const n = r.alteradas;
  return { ok: true, mensagem: `${n} campanha${n === 1 ? "" : "s"} salva${n === 1 ? "" : "s"}.` };
}
