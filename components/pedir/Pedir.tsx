"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Proposta } from "@/lib/types";
import type { PropostaSalva } from "@/lib/servidor/pedidos-nucleo";
import { confirmarPropostaAcao, descartarPropostaAcao, interpretarAcao } from "@/app/nova/acoes";
import { EditorProposta, descreverFaltas, type PessoaEditor } from "../EditorProposta";
import { FormNovaTarefa } from "../tarefa/FormNovaTarefa";
import { Aviso, Botao, Segmentado, TituloPagina } from "../ui";

const EXEMPLOS = [
  "Ítalo, preciso que você aprove o roteiro da aula 3 até sexta. E pede pra equipe de conteúdo as artes dos stories do presencial pra amanhã, é urgente.",
  "Fecha o coffee break do presencial de Aracaju até dia 5/10 e liga hoje pras alunas que abandonaram o checkout.",
];

type Situacao = { tipo: "aberta" } | { tipo: "confirmada"; tarefaId: string; triagem: boolean } | { tipo: "descartada" };
interface Item {
  proposta: PropostaSalva;
  situacao: Situacao;
  erro?: string;
}

export function Pedir({
  pessoas,
  frentes,
  euId,
  abertas,
  temIA,
  modelos,
}: {
  pessoas: PessoaEditor[];
  frentes: { id: string; nome: string }[];
  euId: string;
  abertas: PropostaSalva[];
  temIA: boolean;
  modelos: { id: string; nome: string; itens: string[]; frenteId: string | null }[];
}) {
  const [modo, setModo] = useState<"texto" | "formulario">("texto");
  const [texto, setTexto] = useState("");
  const [interpretando, iniciarInterpretacao] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<{ modo: "ia" | "regras"; modelo: string | null; aviso?: string } | null>(null);
  const [itens, setItens] = useState<Item[]>(() => abertas.map((p) => ({ proposta: p, situacao: { tipo: "aberta" } })));

  function interpretar() {
    setErro(null);
    iniciarInterpretacao(async () => {
      try {
        const r = await interpretarAcao(texto);
        if (!r.ok) {
          setErro(r.motivo);
          return;
        }
        setInfo({ modo: r.modo, modelo: r.modelo, aviso: r.aviso });
        // As novas vêm primeiro; as que já estavam esperando revisão continuam abaixo.
        setItens((xs) => [...r.propostas.map((p) => ({ proposta: p, situacao: { tipo: "aberta" } as Situacao })), ...xs]);
        setTexto("");
      } catch {
        // Falha de rede: o formulário continua disponível (RF-04).
        setErro("Sem conexão com o servidor. Você pode pedir pelo formulário.");
      }
    });
  }

  const atualizar = (id: string, mudar: (x: Item) => Item) => setItens((xs) => xs.map((x) => (x.proposta.id === id ? mudar(x) : x)));

  function confirmar(p: PropostaSalva) {
    iniciarSalvar(async () => {
      const r = await confirmarPropostaAcao(p.id, {
        titulo: p.titulo,
        descricao: p.descricao,
        responsavelId: p.responsavelId,
        prazo: p.prazo,
        frenteId: p.frenteId,
        prioridade: p.prioridade,
        itens: p.subtarefas,
        envolvidosIds: p.envolvidosIds,
      });
      atualizar(p.id, (x) =>
        r.ok ? { ...x, erro: undefined, situacao: { tipo: "confirmada", tarefaId: r.tarefaId, triagem: r.estado === "triagem" } } : { ...x, erro: r.motivo }
      );
    });
  }

  function descartar(p: PropostaSalva) {
    iniciarSalvar(async () => {
      const r = await descartarPropostaAcao(p.id);
      atualizar(p.id, (x) => (r.ok ? { ...x, erro: undefined, situacao: { tipo: "descartada" } } : { ...x, erro: r.motivo }));
    });
  }

  const emAberto = itens.filter((x) => x.situacao.tipo === "aberta");
  const nome = (id: string | null) => pessoas.find((u) => u.id === id)?.nome;

  return (
    <div className="max-w-3xl">
      <TituloPagina
        chapeu="Pedir"
        titulo="O que precisa acontecer?"
        subtitulo="Escreva como você mandaria no WhatsApp, pra qualquer pessoa da equipe, inclusive o Ítalo. A IA separa em tarefas e nada é salvo sem você revisar."
      />

      <div className="mb-5">
        <Segmentado
          rotulo="Modo de pedido"
          valor={modo}
          onChange={setModo}
          opcoes={[
            { valor: "texto", rotulo: "Descrever em texto" },
            { valor: "formulario", rotulo: "Formulário" },
          ]}
        />
      </div>

      {modo === "formulario" && <FormNovaTarefa pessoas={pessoas} frentes={frentes} euId={euId} modelos={modelos} />}

      {modo === "texto" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label htmlFor="pedido" className="sr-only">
              Pedido
            </label>
            <textarea
              id="pedido"
              className="dl-input !min-h-36 !text-base"
              maxLength={4000}
              placeholder="Ex.: Ítalo, preciso que você aprove o roteiro até sexta. E pede pra Ana as artes do presencial pra amanhã."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Botao variant="primary" disabled={!texto.trim() || interpretando} onClick={interpretar}>
                {interpretando ? "Interpretando..." : "Interpretar pedido"}
              </Botao>
              {!temIA && <span className="text-xs text-ink-subtle">Sem IA neste ambiente: interpretação por regras simples.</span>}
              {erro && (
                <span className="text-sm font-semibold text-danger" role="alert">
                  {erro}{" "}
                  <button className="dl-link" onClick={() => setModo("formulario")}>
                    Abrir formulário
                  </button>
                </span>
              )}
            </div>
            {!itens.length && !texto && (
              <div>
                <p className="dl-eyebrow mb-2">Exemplos</p>
                <div className="flex flex-col gap-2">
                  {EXEMPLOS.map((ex) => (
                    <button key={ex} onClick={() => setTexto(ex)} className="dl-card cursor-pointer text-left text-sm text-ink-muted">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {info && (
            <p className="text-xs text-ink-subtle">
              {info.modo === "ia" ? `Interpretado por IA (${info.modelo}).` : "Interpretado por regras simples, sem IA."}
              {info.aviso && <span className="mt-1 block font-semibold text-warning">{info.aviso}</span>}
            </p>
          )}

          {emAberto.length > 0 && (
            <p className="text-sm">
              <strong>{emAberto.length}</strong> {emAberto.length === 1 ? "proposta esperando" : "propostas esperando"} sua revisão
            </p>
          )}

          {itens.map((item, i) => (
            <div key={item.proposta.id} className="dl-panel !p-5 sm:!p-6">
              {item.situacao.tipo === "aberta" && (
                <div className="flex flex-col gap-4">
                  <details className="text-xs text-ink-muted">
                    <summary className="cursor-pointer">Do pedido: “{item.proposta.textoPedido.slice(0, 80)}{item.proposta.textoPedido.length > 80 ? "…" : ""}”</summary>
                    <p className="mt-2 whitespace-pre-wrap">{item.proposta.textoPedido || "(texto apagado pela política de retenção)"}</p>
                  </details>
                  {item.proposta.ambiguidades.length > 0 && <Aviso tom="warning" titulo="A IA ficou em dúvida" itens={item.proposta.ambiguidades} />}
                  <EditorProposta
                    proposta={item.proposta}
                    onChange={(p: Proposta) => atualizar(item.proposta.id, (x) => ({ ...x, proposta: { ...x.proposta, ...p } }))}
                    pessoas={pessoas}
                    frentes={frentes}
                    euId={euId}
                    prefixo={`p${i}`}
                  />
                  {descreverFaltas(item.proposta).length > 0 && (
                    <p className="text-xs font-semibold text-warning">
                      Sem {descreverFaltas(item.proposta).join(", ")}: vai para a triagem e ninguém é avisado ainda.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Botao variant="primary" disabled={salvando || !item.proposta.titulo.trim()} onClick={() => confirmar(item.proposta)}>
                      Confirmar
                    </Botao>
                    <Botao variant="danger" disabled={salvando} onClick={() => descartar(item.proposta)}>
                      Descartar
                    </Botao>
                    {item.erro && (
                      <span className="text-sm font-semibold text-danger" role="alert">
                        {item.erro}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {item.situacao.tipo === "confirmada" && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.proposta.titulo}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {item.situacao.triagem
                        ? "Foi pra triagem: falta definir algo antes de alguém ser avisado."
                        : item.proposta.responsavelId && item.proposta.responsavelId !== euId
                          ? `Criada. ${nome(item.proposta.responsavelId)} recebe o aviso no WhatsApp.`
                          : "Criada."}
                    </p>
                  </div>
                  <Link href={`/tarefa/${item.situacao.tarefaId}`} className="dl-btn dl-btn-secondary">
                    Abrir
                  </Link>
                </div>
              )}

              {item.situacao.tipo === "descartada" && <p className="text-sm text-ink-subtle line-through">{item.proposta.titulo}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
