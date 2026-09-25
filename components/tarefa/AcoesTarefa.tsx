"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Estado, Prioridade } from "@/lib/types";
import type { Pessoa, TarefaDetalhe } from "@/lib/visao";
import { ROTULO_PRIORIDADE, pendenciasParaLiberar, rotuloTransicao, transicoesPermitidas } from "@/lib/regras";
import { CONFLITO } from "@/lib/conflito";
import { arquivarAcao, desarquivarAcao, editarTarefaAcao, mudarEtapaAcao } from "@/app/tarefa/acoes";
import { useAvisos } from "../Avisos";
import { Botao, Campo } from "../ui";

type Frente = { id: string; nome: string; usaRevisao: boolean };
type Retorno = { ok: true } | { ok: false; motivo: string };

// Etapas, arquivar e editar. Toda ação leva a versão que a pessoa está vendo;
// se outra pessoa salvou antes, o servidor recusa e aparece "Recarregar".
export function AcoesTarefa({ tarefa, pessoas, frentes }: { tarefa: TarefaDetalhe; pessoas: Pessoa[]; frentes: Frente[] }) {
  const router = useRouter();
  const { avisar } = useAvisos();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [editando, setEditando] = useState(false);

  const transicoes = transicoesPermitidas(tarefa, { usaRevisao: tarefa.frenteUsaRevisao });
  const faltas =
    tarefa.estado === "triagem"
      ? pendenciasParaLiberar({ responsavelId: tarefa.responsavel?.id ?? null, prazo: tarefa.prazo, frenteId: tarefa.frente?.id ?? null })
      : [];

  function rodar(fn: () => Promise<Retorno>, depois?: () => void) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.motivo);
      else depois?.();
    });
  }

  function transicionar(para: Estado) {
    if (para === "bloqueada" && !pedindoMotivo) {
      setPedindoMotivo(true);
      return;
    }
    rodar(
      () => mudarEtapaAcao(tarefa.id, tarefa.versao, para, para === "bloqueada" ? motivo : ""),
      () => {
        setPedindoMotivo(false);
        setMotivo("");
      }
    );
  }

  function arquivar() {
    const id = tarefa.id;
    const proxima = tarefa.versao + 1;
    rodar(
      () => arquivarAcao(id, tarefa.versao),
      () =>
        avisar("Tarefa arquivada.", () => {
          void desarquivarAcao(id, proxima).then((r) => {
            if (!r.ok) avisar(r.motivo);
          });
        })
    );
  }

  if (tarefa.estado === "arquivada") {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <Botao variant="secondary" disabled={pendente} onClick={() => rodar(() => desarquivarAcao(tarefa.id, tarefa.versao))}>
            Desfazer arquivamento
          </Botao>
        </div>
        <Erro erro={erro} recarregar={() => router.refresh()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {transicoes.map((para) => (
          <Botao
            key={para}
            disabled={pendente || (tarefa.estado === "triagem" && faltas.length > 0)}
            onClick={() => transicionar(para)}
            variant={
              para === "concluida" || (tarefa.estado === "triagem" && para === "a_fazer")
                ? "primary"
                : para === "bloqueada"
                  ? "danger"
                  : "secondary"
            }
          >
            {rotuloTransicao(tarefa.estado, para)}
          </Botao>
        ))}
        <Botao variant="secondary" disabled={pendente} onClick={() => setEditando((v) => !v)} aria-expanded={editando}>
          {editando ? "Fechar edição" : "Editar"}
        </Botao>
        <Botao variant="ghost" disabled={pendente} onClick={arquivar}>
          Arquivar
        </Botao>
      </div>

      {faltas.length > 0 && (
        <p className="text-sm text-ink-muted">
          Para liberar, defina {faltas.join(", ")} em <strong>Editar</strong>.
        </p>
      )}

      {pedindoMotivo && (
        <div className="dl-surgir flex flex-col gap-2 sm:flex-row">
          <input
            className="dl-input"
            placeholder="O que está travando? (obrigatório)"
            aria-label="Motivo do bloqueio"
            maxLength={300}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && motivo.trim() && transicionar("bloqueada")}
            autoFocus
          />
          <Botao variant="danger" disabled={pendente || !motivo.trim()} onClick={() => transicionar("bloqueada")}>
            Confirmar bloqueio
          </Botao>
          <Botao variant="ghost" onClick={() => setPedindoMotivo(false)}>
            Cancelar
          </Botao>
        </div>
      )}

      <Erro erro={erro} recarregar={() => router.refresh()} />

      {editando && (
        <FormEditar
          tarefa={tarefa}
          pessoas={pessoas}
          frentes={frentes}
          aoSalvar={() => {
            setEditando(false);
            avisar("Alterações salvas.");
          }}
        />
      )}
    </div>
  );
}

function Erro({ erro, recarregar }: { erro: string | null; recarregar: () => void }) {
  if (!erro) return null;
  return (
    <div className="flex flex-wrap items-center gap-3" role="alert">
      <p className="text-sm font-semibold text-danger">{erro}</p>
      {erro === CONFLITO && (
        <Botao variant="secondary" onClick={recarregar}>
          Recarregar
        </Botao>
      )}
    </div>
  );
}

function FormEditar({
  tarefa,
  pessoas,
  frentes,
  aoSalvar,
}: {
  tarefa: TarefaDetalhe;
  pessoas: Pessoa[];
  frentes: Frente[];
  aoSalvar: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [descricao, setDescricao] = useState(tarefa.descricao);
  const [resp, setResp] = useState(tarefa.responsavel?.id ?? "");
  const [prazo, setPrazo] = useState(tarefa.prazo ?? "");
  const [frenteId, setFrenteId] = useState(tarefa.frente?.id ?? "");
  const [prio, setPrio] = useState<Prioridade>(tarefa.prioridade);
  // Quem perdeu o acesso não aparece na lista de pessoas, mas continua como
  // responsável até alguém trocar.
  const atual = tarefa.responsavel;
  const opcoesResp = atual && !pessoas.some((p) => p.id === atual.id) ? [...pessoas, atual] : pessoas;

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await editarTarefaAcao(tarefa.id, tarefa.versao, {
        titulo,
        descricao,
        responsavelId: resp || null,
        prazo: prazo || null,
        frenteId: frenteId || null,
        prioridade: prio,
      });
      if (r.ok) aoSalvar();
      else setErro(r.motivo);
    });
  }

  return (
    <div className="dl-panel dl-surgir flex flex-col gap-4">
      <Campo id="ed-titulo" rotulo="Título">
        <input id="ed-titulo" className="dl-input" maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </Campo>
      <Campo id="ed-desc" rotulo="Contexto">
        <textarea id="ed-desc" className="dl-input" maxLength={5000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="ed-resp" rotulo="Quem faz">
          <select id="ed-resp" className="dl-input" value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Ninguém ainda</option>
            {opcoesResp.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="ed-prazo" rotulo="Prazo">
          <input id="ed-prazo" type="date" className="dl-input" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </Campo>
        <Campo id="ed-frente" rotulo="Frente">
          <select id="ed-frente" className="dl-input" value={frenteId} onChange={(e) => setFrenteId(e.target.value)}>
            <option value="">Sem frente</option>
            {frentes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="ed-prio" rotulo="Prioridade">
          <select id="ed-prio" className="dl-input" value={prio} onChange={(e) => setPrio(e.target.value as Prioridade)}>
            {(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => (
              <option key={p} value={p}>
                {ROTULO_PRIORIDADE[p]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div>
        <Botao variant="primary" disabled={pendente} onClick={salvar}>
          {pendente ? "Salvando..." : "Salvar"}
        </Botao>
      </div>
      <Erro erro={erro} recarregar={() => router.refresh()} />
    </div>
  );
}
