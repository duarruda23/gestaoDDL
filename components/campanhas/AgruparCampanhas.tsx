"use client";

import { useActionState, useMemo, useState } from "react";
import { agruparAcao, type EstadoAgrupar } from "@/app/campanhas/acoes";
import { Botao, Campo } from "@/components/ui";
import { dinheiro } from "@/lib/campanhas-formato";

export interface CampanhaParaAgrupar {
  id: string;
  nome: string;
  status: string;
  gasto: number;
  funilRotulo: string;
  origem: "manual" | "sugestao" | "nenhuma" | "fora";
}

export interface FunilOpcao {
  chave: string;
  rotulo: string;
}

const ORIGEM: Record<CampanhaParaAgrupar["origem"], string> = {
  manual: "agrupada por você",
  sugestao: "sugerida pelo nome",
  nenhuma: "sem funil",
  fora: "fora do escopo",
};

export function AgruparCampanhas({ campanhas, funis }: { campanhas: CampanhaParaAgrupar[]; funis: FunilOpcao[] }) {
  const [estado, acao, salvando] = useActionState<EstadoAgrupar, FormData>(agruparAcao, { ok: false, mensagem: null });
  const [filtro, setFiltro] = useState<string>("todas");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");

  const visiveis = useMemo(
    () =>
      campanhas.filter((c) =>
        filtro === "todas" ? true : filtro === "nenhuma" ? c.origem === "nenhuma" : c.funilRotulo === filtro
      ),
    [campanhas, filtro]
  );
  const rotulosPresentes = useMemo(() => [...new Set(campanhas.map((c) => c.funilRotulo))].sort(), [campanhas]);

  function alternar(id: string) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
  const todasVisiveisMarcadas = visiveis.length > 0 && visiveis.every((c) => marcadas.has(c.id));
  function marcarVisiveis() {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      for (const c of visiveis) {
        if (todasVisiveisMarcadas) novo.delete(c.id);
        else novo.add(c.id);
      }
      return novo;
    });
  }

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="dl-panel flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          Marque as campanhas que fazem parte do mesmo funil, escolha o funil e salve. O que você salva vale por cima da sugestão pelo nome.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Campo id="destino" rotulo={`Levar ${marcadas.size} marcada${marcadas.size === 1 ? "" : "s"} para`}>
            <select id="destino" name="destino" className="dl-input" value={destino} onChange={(e) => setDestino(e.target.value)} required>
              <option value="">Escolha…</option>
              {funis.map((f) => (
                <option key={f.chave} value={`funil:${f.chave}`}>
                  {f.rotulo}
                </option>
              ))}
              <option value="novo">+ Criar funil novo…</option>
              <option value="fora">Fora do escopo (ignorar)</option>
              <option value="sugestao">Voltar para a sugestão pelo nome</option>
            </select>
          </Campo>
          {destino === "novo" && (
            <Campo id="novoFunil" rotulo="Nome do funil novo">
              <input id="novoFunil" name="novoFunil" className="dl-input" maxLength={80} required />
            </Campo>
          )}
          <Botao type="submit" variant="primary" disabled={salvando || marcadas.size === 0 || !destino}>
            {salvando ? "Salvando..." : "Salvar agrupamento"}
          </Botao>
        </div>
        {estado.mensagem && (
          <p className={estado.ok ? "text-sm text-success" : "text-sm text-danger"} role={estado.ok ? "status" : "alert"}>
            {estado.mensagem}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold" htmlFor="filtro-funil">
          Mostrar
        </label>
        <select id="filtro-funil" className="dl-input !w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todas">Todas as campanhas ({campanhas.length})</option>
          <option value="nenhuma">Só as sem funil ({campanhas.filter((c) => c.origem === "nenhuma").length})</option>
          {rotulosPresentes.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="button" className="dl-btn dl-btn-ghost !min-h-9 !px-3" onClick={marcarVisiveis}>
          {todasVisiveisMarcadas ? "Desmarcar as listadas" : "Marcar as listadas"}
        </button>
      </div>

      <div className="dl-panel !p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="p-3 w-10">
                <span className="sr-only">Marcar</span>
              </th>
              <th className="p-3 font-semibold">Campanha</th>
              <th className="p-3 font-semibold">Funil hoje</th>
              <th className="p-3 font-semibold text-right">Gasto no período</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visiveis.map((c) => (
              <tr key={c.id} className={marcadas.has(c.id) ? "bg-brand-soft" : undefined}>
                <td className="p-3">
                  <input
                    type="checkbox"
                    name="campanha"
                    value={c.id}
                    checked={marcadas.has(c.id)}
                    onChange={() => alternar(c.id)}
                    aria-label={`Marcar ${c.nome}`}
                    className="h-4 w-4"
                  />
                </td>
                <td className="p-3 font-bold break-words max-w-[380px]">
                  {c.nome}
                  <span className="block text-xs font-normal text-ink-subtle">
                    {c.status === "active" ? "Ativa" : c.status === "paused" ? "Pausada" : c.status}
                  </span>
                </td>
                <td className="p-3">
                  {c.funilRotulo}
                  <span className="block text-xs text-ink-subtle">{ORIGEM[c.origem]}</span>
                </td>
                <td className="p-3 text-right tabular-nums">{c.gasto > 0 ? dinheiro(c.gasto) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visiveis.length && <p className="p-4 text-sm text-ink-muted">Nenhuma campanha neste filtro.</p>}
      </div>
    </form>
  );
}
