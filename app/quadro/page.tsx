"use client";

import Link from "next/link";
import { useState } from "react";
import { useGestao } from "@/lib/store";
import type { Estado, Prioridade } from "@/lib/types";
import { COLUNAS_QUADRO, ROTULO_ESTADO, ROTULO_PRIORIDADE, estaVencida, ordenarPorUrgencia } from "@/lib/regras";
import { descreverPrazo } from "@/lib/datas";
import { CartaoTarefa, EtiquetaEstado, Segmentado, TituloPagina, Vazio } from "@/components/ui";

export default function Quadro() {
  const { usuarioAtual, tarefas, usuarios, frentes } = useGestao();
  const [visao, setVisao] = useState<"quadro" | "lista">("quadro");
  const [pessoa, setPessoa] = useState("");
  const [pediu, setPediu] = useState("");
  const [frente, setFrente] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [soVencidas, setSoVencidas] = useState(false);
  const [estadoLista, setEstadoLista] = useState<Estado | "">("");

  const filtradas = tarefas
    .filter((t) => t.estado !== "arquivada")
    .filter((t) => !pessoa || (pessoa === "sem" ? !t.responsavelId : t.responsavelId === pessoa))
    .filter((t) => !pediu || t.criadorId === pediu)
    .filter((t) => !frente || t.frenteId === frente)
    .filter((t) => !prioridade || t.prioridade === prioridade)
    .filter((t) => !soVencidas || estaVencida(t))
    .sort(ordenarPorUrgencia);
  const daLista = filtradas.filter((t) => !estadoLista || t.estado === estadoLista);
  const nome = (id: string | null) => usuarios.find((u) => u.id === id)?.nome;

  return (
    <div>
      <TituloPagina
        chapeu="Quadro"
        titulo="Tudo o que está em andamento"
        subtitulo="Todo mundo vê tudo. Filtre por quem faz ou por quem pediu."
        acao={
          <Segmentado
            rotulo="Visualização"
            valor={visao}
            onChange={setVisao}
            opcoes={[
              { valor: "quadro", rotulo: "Quadro" },
              { valor: "lista", rotulo: "Lista" },
            ]}
          />
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
        <select className="dl-input md:!w-auto" value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Quem faz">
          <option value="">Quem faz: todos</option>
          <option value="sem">Sem responsável</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              Faz: {u.id === usuarioAtual?.id ? "eu" : u.nome}
            </option>
          ))}
        </select>
        <select className="dl-input md:!w-auto" value={pediu} onChange={(e) => setPediu(e.target.value)} aria-label="Quem pediu">
          <option value="">Quem pediu: todos</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              Pediu: {u.id === usuarioAtual?.id ? "eu" : u.nome}
            </option>
          ))}
        </select>
        <select className="dl-input md:!w-auto" value={frente} onChange={(e) => setFrente(e.target.value)} aria-label="Frente">
          <option value="">Todas as frentes</option>
          {frentes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <select className="dl-input md:!w-auto" value={prioridade} onChange={(e) => setPrioridade(e.target.value)} aria-label="Prioridade">
          <option value="">Qualquer prioridade</option>
          {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
            <option key={p} value={p}>
              {ROTULO_PRIORIDADE[p]}
            </option>
          ))}
        </select>
        {visao === "lista" && (
          <select className="dl-input md:!w-auto" value={estadoLista} onChange={(e) => setEstadoLista(e.target.value as Estado | "")} aria-label="Estado">
            <option value="">Qualquer estado</option>
            {COLUNAS_QUADRO.map((e) => (
              <option key={e} value={e}>
                {ROTULO_ESTADO[e]}
              </option>
            ))}
          </select>
        )}
        <label className="col-span-2 flex items-center gap-2 text-sm font-semibold md:ml-2">
          <input type="checkbox" checked={soVencidas} onChange={(e) => setSoVencidas(e.target.checked)} className="accent-[var(--brand)]" />
          Só vencidas
        </label>
      </div>

      {visao === "quadro" ? (
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto pb-4 snap-x">
          {COLUNAS_QUADRO.map((col) => {
            const daColuna = filtradas.filter((t) => t.estado === col);
            return (
              <div key={col} className="dl-column w-[82vw] sm:w-72 shrink-0 snap-start">
                <div className="mb-3 flex items-center justify-between">
                  <EtiquetaEstado estado={col} />
                  <span className="text-xs font-semibold tabular-nums text-ink-subtle">{daColuna.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {daColuna.length ? (
                    daColuna.map((t) => <CartaoTarefa key={t.id} tarefa={t} />)
                  ) : (
                    <p className="py-4 text-center text-xs text-ink-subtle">Vazio</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dl-panel !p-0 divide-y divide-line overflow-hidden">
          {daLista.length === 0 && (
            <div className="p-4">
              <Vazio>Nenhuma tarefa com esses filtros.</Vazio>
            </div>
          )}
          {daLista.map((t) => {
            const vencida = estaVencida(t);
            return (
              <Link key={t.id} href={`/tarefa/${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 hover:bg-surface-section">
                <span className="flex-1 min-w-[200px] text-sm font-bold">{t.titulo}</span>
                <EtiquetaEstado estado={t.estado} />
                <span className="w-28 text-xs text-ink-muted">Faz: {nome(t.responsavelId) ?? "ninguém"}</span>
                <span className="w-28 text-xs text-ink-muted">Pediu: {nome(t.criadorId) ?? "?"}</span>
                <span className={`w-28 text-xs ${vencida ? "text-danger font-extrabold" : "text-ink-muted"}`}>{descreverPrazo(t.prazo)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
