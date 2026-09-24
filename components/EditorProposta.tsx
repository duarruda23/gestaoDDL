"use client";

import { useGestao } from "@/lib/store";
import type { Proposta } from "@/lib/types";
import { ROTULO_PRIORIDADE } from "@/lib/regras";
import { descreverPrazo } from "@/lib/datas";
import { Campo } from "./ui";

// Editor usado tanto na revisão das propostas da IA quanto no formulário
// manual: os dois modos mostram os mesmos dados antes de salvar (seção 4).

// EvidenceNote do design system: trecho do pedido + selo "deduzido".
function Evidencia({ proposta, campo }: { proposta: Proposta; campo: string }) {
  const evid = proposta.evidencias.filter((e) => e.campo === campo);
  const inferido = proposta.inferidos.includes(campo);
  if (!evid.length && !inferido) return null;
  return (
    <span className="dl-evidence">
      {inferido && (
        <span className="dl-evidence-inferred" title="A IA deduziu este campo; não estava escrito">
          deduzido
        </span>
      )}
      {evid.map((e, i) => (
        <span key={i} className="dl-evidence-quote">
          &ldquo;{e.trecho}&rdquo;
        </span>
      ))}
    </span>
  );
}

export function EditorProposta({
  proposta,
  onChange,
  mostrarOrigem,
  prefixo,
}: {
  proposta: Proposta;
  onChange: (p: Proposta) => void;
  mostrarOrigem: boolean;
  prefixo: string;
}) {
  const { usuarios, frentes, usuarioAtual } = useGestao();
  const set = <K extends keyof Proposta>(k: K, v: Proposta[K]) => {
    // Campo alterado por uma pessoa deixa de ser "deduzido".
    const campo = k === "responsavelId" ? "responsavel_id" : k === "frenteId" ? "frente_id" : String(k);
    onChange({ ...proposta, [k]: v, inferidos: proposta.inferidos.filter((c) => c !== campo) });
  };
  const id = (c: string) => `${prefixo}-${c}`;

  return (
    <div className="flex flex-col gap-4">
      <Campo id={id("titulo")} rotulo="O que precisa ser feito">
        <input id={id("titulo")} className="dl-input" value={proposta.titulo} onChange={(e) => set("titulo", e.target.value)} />
      </Campo>

      <Campo id={id("descricao")} rotulo="Contexto">
        <textarea
          id={id("descricao")}
          className="dl-input"
          value={proposta.descricao}
          onChange={(e) => set("descricao", e.target.value)}
          placeholder="O que a pessoa precisa saber para fazer (opcional)"
        />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id={id("resp")}
          rotulo="Quem faz"
          estado={!proposta.responsavelId ? "pending" : undefined}
          ajuda={!proposta.responsavelId ? "Sem responsável, vai para a triagem." : undefined}
        >
          <select id={id("resp")} className="dl-input" value={proposta.responsavelId ?? ""} onChange={(e) => set("responsavelId", e.target.value || null)}>
            <option value="">Escolher depois</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id === usuarioAtual?.id ? `${u.nome} (você)` : u.nome} · {u.funcao}
              </option>
            ))}
          </select>
          {mostrarOrigem && <Evidencia proposta={proposta} campo="responsavel_id" />}
        </Campo>

        <Campo id={id("frente")} rotulo="Frente" estado={!proposta.frenteId ? "pending" : undefined}>
          <select id={id("frente")} className="dl-input" value={proposta.frenteId ?? ""} onChange={(e) => set("frenteId", e.target.value || null)}>
            <option value="">Escolher depois</option>
            {frentes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
          {mostrarOrigem && <Evidencia proposta={proposta} campo="frente_id" />}
        </Campo>

        <Campo
          id={id("prazo")}
          rotulo={proposta.prazo ? `Prazo · ${descreverPrazo(proposta.prazo)}` : "Prazo"}
          estado={!proposta.prazo ? "pending" : undefined}
        >
          <input id={id("prazo")} type="date" className="dl-input" value={proposta.prazo ?? ""} onChange={(e) => set("prazo", e.target.value || null)} />
          {mostrarOrigem && <Evidencia proposta={proposta} campo="prazo" />}
        </Campo>

        <Campo id={id("prio")} rotulo="Prioridade">
          <select id={id("prio")} className="dl-input" value={proposta.prioridade} onChange={(e) => set("prioridade", e.target.value as Proposta["prioridade"])}>
            {(Object.keys(ROTULO_PRIORIDADE) as Proposta["prioridade"][]).map((p) => (
              <option key={p} value={p}>
                {ROTULO_PRIORIDADE[p]}
              </option>
            ))}
          </select>
          {mostrarOrigem && <Evidencia proposta={proposta} campo="prioridade" />}
        </Campo>
      </div>

      <Campo id={id("check")} rotulo="Checklist (um item por linha)">
        <textarea
          id={id("check")}
          className="dl-input"
          value={proposta.subtarefas.join("\n")}
          onChange={(e) => set("subtarefas", e.target.value.split("\n"))}
          placeholder="Opcional"
        />
      </Campo>

      {proposta.envolvidosIds.length > 0 && (
        <p className="text-xs text-ink-muted">
          Também citados:{" "}
          {proposta.envolvidosIds
            .map((uid) => usuarios.find((u) => u.id === uid)?.nome)
            .filter(Boolean)
            .join(", ")}
        </p>
      )}
    </div>
  );
}

export function descreverFaltas(p: Proposta): string[] {
  const faltas: string[] = [];
  if (!p.responsavelId) faltas.push("quem faz");
  if (!p.prazo) faltas.push("prazo");
  if (!p.frenteId) faltas.push("frente");
  return faltas;
}
