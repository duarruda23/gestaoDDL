"use client";

import { useActionState, useState } from "react";
import type { Prioridade } from "@/lib/types";
import type { Pessoa } from "@/lib/visao";
import { ROTULO_PRIORIDADE, pendenciasParaLiberar } from "@/lib/regras";
import { criarTarefaAcao, type EstadoNova } from "@/app/tarefa/acoes";
import { Botao, Campo } from "../ui";

export function FormNovaTarefa({
  pessoas,
  frentes,
  euId,
  modelos = [],
}: {
  pessoas: Pessoa[];
  frentes: { id: string; nome: string }[];
  euId: string;
  modelos?: { id: string; nome: string; itens: string[]; frenteId: string | null }[];
}) {
  const [estado, acao, enviando] = useActionState<EstadoNova, FormData>(criarTarefaAcao, { ok: false, mensagem: null });
  // Tudo controlado: o React limpa campos não controlados depois de cada envio,
  // e um erro de validação não pode apagar o que a pessoa escreveu.
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [itens, setItens] = useState("");
  const [resp, setResp] = useState("");
  const [prazo, setPrazo] = useState("");
  const [frenteId, setFrenteId] = useState("");
  const faltas = pendenciasParaLiberar({ responsavelId: resp || null, prazo: prazo || null, frenteId: frenteId || null });

  return (
    <form action={acao} className="dl-panel !p-5 sm:!p-6 flex flex-col gap-4">
      <Campo id="nv-titulo" rotulo="Título">
        <input id="nv-titulo" name="titulo" className="dl-input" maxLength={200} required autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Fechar hotel do presencial de Maceió" />
      </Campo>
      <Campo id="nv-desc" rotulo="Contexto" ajuda="Opcional. O que a pessoa precisa saber para fazer.">
        <textarea id="nv-desc" name="descricao" className="dl-input" maxLength={5000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nv-resp" rotulo="Quem faz">
          <select id="nv-resp" name="responsavelId" className="dl-input" value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Ninguém ainda</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === euId ? `${p.nome} (eu)` : p.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="nv-prazo" rotulo="Prazo">
          <input id="nv-prazo" name="prazo" type="date" className="dl-input" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </Campo>
        <Campo id="nv-frente" rotulo="Frente">
          <select id="nv-frente" name="frenteId" className="dl-input" value={frenteId} onChange={(e) => setFrenteId(e.target.value)}>
            <option value="">Sem frente</option>
            {frentes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="nv-prio" rotulo="Prioridade">
          <select id="nv-prio" name="prioridade" className="dl-input" value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
            {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
              <option key={p} value={p}>
                {ROTULO_PRIORIDADE[p]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {modelos.length > 0 && (
        <Campo id="nv-modelo" rotulo="Começar de um modelo" ajuda="Opcional. Preenche o checklist (e a frente, se estiver vazia).">
          <select
            id="nv-modelo"
            className="dl-input"
            value=""
            onChange={(e) => {
              const m = modelos.find((x) => x.id === e.target.value);
              if (!m) return;
              const atuais = itens.split("\n").map((x) => x.trim()).filter(Boolean);
              setItens([...atuais, ...m.itens.filter((x) => !atuais.includes(x))].join("\n"));
              if (!frenteId && m.frenteId) setFrenteId(m.frenteId);
            }}
          >
            <option value="">Escolher modelo…</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} ({m.itens.length} itens)
              </option>
            ))}
          </select>
        </Campo>
      )}
      <Campo id="nv-itens" rotulo="Checklist" ajuda="Opcional. Um item por linha.">
        <textarea id="nv-itens" name="itens" className="dl-input" value={itens} onChange={(e) => setItens(e.target.value)} placeholder={"Cotar três hotéis\nReservar"} />
      </Campo>

      <p className="text-sm text-ink-muted" role="status">
        {faltas.length
          ? `Sem ${faltas.join(", ")}, o pedido vai para a triagem até alguém completar.`
          : "Completo: já entra em “A fazer”."}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variant="primary" disabled={enviando}>
          {enviando ? "Pedindo..." : "Pedir"}
        </Botao>
        {estado.mensagem && (
          <span className="text-sm font-semibold text-danger" role="alert">
            {estado.mensagem}
          </span>
        )}
      </div>
    </form>
  );
}
