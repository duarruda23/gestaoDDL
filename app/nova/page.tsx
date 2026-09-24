"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGestao } from "@/lib/store";
import type { Proposta, ResultadoInterpretacao, Tarefa } from "@/lib/types";
import { EditorProposta, descreverFaltas } from "@/components/EditorProposta";
import { Aviso, Botao, EtiquetaEstado, Segmentado, TituloPagina } from "@/components/ui";

const EXEMPLOS = [
  "Ítalo, preciso que você aprove o roteiro da aula 3 da VSL até sexta. E pede pro Bruno as artes dos stories do presencial de Maceió pra amanhã, é urgente.",
  "Diego, fecha o coffee break do presencial de Aracaju até dia 5/10. Larissa, liga hoje pras alunas que abandonaram o checkout.",
  "Precisamos organizar os depoimentos das alunas pra página de vendas nova semana que vem.",
];

type Situacao = { tipo: "aberta" } | { tipo: "confirmada"; tarefa: Tarefa } | { tipo: "descartada" };

interface Item {
  proposta: Proposta;
  situacao: Situacao;
}

function propostaVazia(): Proposta {
  return {
    id: "manual",
    titulo: "",
    descricao: "",
    frenteId: null,
    responsavelId: null,
    envolvidosIds: [],
    prazo: null,
    prioridade: "media",
    subtarefas: [],
    evidencias: [],
    inferidos: [],
    ambiguidades: [],
  };
}

export default function Pedir() {
  const { usuarioAtual, usuarios, registrarPedido, confirmarProposta, descartarProposta, criarManual } = useGestao();
  const router = useRouter();
  const [modo, setModo] = useState<"texto" | "formulario">("texto");
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoInterpretacao | null>(null);
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [manual, setManual] = useState<Proposta>(propostaVazia);

  if (!usuarioAtual) return null;

  async function interpretar() {
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/interpretar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          autorId: usuarioAtual!.id,
          equipe: usuarios.filter((u) => u.ativo).map(({ id, nome, funcao, frenteIds }) => ({ id, nome, funcao, frenteIds })),
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setErro(dados.erro ?? "Não consegui interpretar o pedido.");
        return;
      }
      const r = dados as ResultadoInterpretacao;
      setResultado(r);
      setItens(r.propostas.map((p) => ({ proposta: p, situacao: { tipo: "aberta" } })));
      setPedidoId(registrarPedido({ texto, modo: r.modo, modelo: r.modelo, versaoPrompt: r.versaoPrompt }));
    } catch {
      // Falha de rede: o formulário manual continua disponível (RF-04).
      setErro("Sem conexão com o servidor. Você pode pedir pelo formulário.");
    } finally {
      setCarregando(false);
    }
  }

  function atualizar(i: number, p: Proposta) {
    setItens((xs) => xs.map((x, j) => (j === i ? { ...x, proposta: p } : x)));
  }

  function confirmar(i: number) {
    if (!pedidoId) return;
    const item = itens[i];
    if (!item.proposta.titulo.trim()) return;
    const tarefa = confirmarProposta({ proposta: item.proposta, pedidoId });
    setItens((xs) => xs.map((x, j) => (j === i ? { ...x, situacao: { tipo: "confirmada", tarefa } } : x)));
  }

  function descartar(i: number) {
    if (pedidoId) descartarProposta(pedidoId);
    setItens((xs) => xs.map((x, j) => (j === i ? { ...x, situacao: { tipo: "descartada" } } : x)));
  }

  function dividir(i: number) {
    setItens((xs) => {
      const copia: Item = {
        proposta: { ...xs[i].proposta, id: `${xs[i].proposta.id}-b`, titulo: `${xs[i].proposta.titulo} (parte 2)` },
        situacao: { tipo: "aberta" },
      };
      return [...xs.slice(0, i + 1), copia, ...xs.slice(i + 1)];
    });
  }

  function recomecar() {
    setResultado(null);
    setItens([]);
    setPedidoId(null);
    setTexto("");
  }

  function salvarManual() {
    if (!manual.titulo.trim()) return;
    const t = criarManual({ ...manual, subtarefas: manual.subtarefas });
    router.push(`/tarefa/${t.id}`);
  }

  const abertas = itens.filter((x) => x.situacao.tipo === "aberta").length;
  const nomeDe = (id: string | null) => usuarios.find((u) => u.id === id)?.nome;

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

      {modo === "formulario" && (
        <div className="dl-panel !p-5 sm:!p-6 flex flex-col gap-4">
          <EditorProposta proposta={manual} onChange={setManual} mostrarOrigem={false} prefixo="manual" />
          {descreverFaltas(manual).length > 0 && manual.titulo && (
            <p className="text-xs font-semibold text-warning">
              Sem {descreverFaltas(manual).join(", ")}: vai para a triagem e ninguém é cobrado ainda.
            </p>
          )}
          <div>
            <Botao variant="primary" disabled={!manual.titulo.trim()} onClick={salvarManual}>
              Criar tarefa
            </Botao>
          </div>
        </div>
      )}

      {modo === "texto" && !resultado && (
        <div className="flex flex-col gap-4">
          <label htmlFor="pedido" className="sr-only">
            Pedido
          </label>
          <textarea
            id="pedido"
            className="dl-input !min-h-36 !text-base"
            placeholder="Ex.: Ítalo, preciso que você aprove o roteiro até sexta. E pede pro Bruno as artes do presencial pra amanhã."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Botao variant="primary" disabled={!texto.trim() || carregando} onClick={interpretar}>
              {carregando ? "Interpretando..." : "Interpretar pedido"}
            </Botao>
            {erro && (
              <span className="text-sm font-semibold text-danger">
                {erro}{" "}
                <button className="dl-link" onClick={() => setModo("formulario")}>
                  Abrir formulário
                </button>
              </span>
            )}
          </div>
          <div>
            <p className="dl-eyebrow mb-2">Exemplos pra testar</p>
            <div className="flex flex-col gap-2">
              {EXEMPLOS.map((ex) => (
                <button key={ex} onClick={() => setTexto(ex)} className="dl-card text-left text-sm text-ink-muted cursor-pointer">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {modo === "texto" && resultado && (
        <div className="flex flex-col gap-4">
          <div className="dl-column !p-4">
            <p className="dl-eyebrow">Pedido de {usuarioAtual.nome}</p>
            <p className="mt-2 text-[15px] leading-[22px] whitespace-pre-wrap">{texto}</p>
            <p className="mt-3 text-xs text-ink-subtle">
              {resultado.modo === "ia"
                ? `Interpretado por ${resultado.modelo} · prompt ${resultado.versaoPrompt}`
                : `Interpretação por regras, sem IA · ${resultado.versaoPrompt}`}
            </p>
            {resultado.aviso && <p className="mt-2 text-xs font-semibold text-warning">{resultado.aviso}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <strong>{itens.length}</strong> {itens.length === 1 ? "tarefa proposta" : "tarefas propostas"} · {abertas} aguardando revisão
            </p>
            <div className="flex gap-2">
              <Botao variant="secondary" onClick={recomecar}>
                Novo pedido
              </Botao>
              {abertas > 1 && (
                <Botao variant="primary" onClick={() => itens.forEach((x, i) => x.situacao.tipo === "aberta" && confirmar(i))}>
                  Confirmar todas
                </Botao>
              )}
            </div>
          </div>

          {itens.map((item, i) => (
            <div key={item.proposta.id} className="dl-panel !p-5 sm:!p-6">
              <p className="dl-eyebrow mb-4">Proposta {i + 1}</p>

              {item.situacao.tipo === "aberta" && (
                <div className="flex flex-col gap-4">
                  {item.proposta.ambiguidades.length > 0 && (
                    <Aviso tom="warning" titulo="A IA ficou em dúvida" itens={item.proposta.ambiguidades} />
                  )}
                  <EditorProposta proposta={item.proposta} onChange={(p) => atualizar(i, p)} mostrarOrigem prefixo={`p${i}`} />
                  {descreverFaltas(item.proposta).length > 0 && (
                    <p className="text-xs font-semibold text-warning">
                      Sem {descreverFaltas(item.proposta).join(", ")}: vai para a triagem e ninguém é cobrado ainda.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Botao variant="primary" disabled={!item.proposta.titulo.trim()} onClick={() => confirmar(i)}>
                      Confirmar
                    </Botao>
                    <Botao variant="secondary" onClick={() => dividir(i)}>
                      Dividir em duas
                    </Botao>
                    <Botao variant="danger" onClick={() => descartar(i)}>
                      Descartar
                    </Botao>
                  </div>
                </div>
              )}

              {item.situacao.tipo === "confirmada" && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.situacao.tarefa.titulo}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <EtiquetaEstado estado={item.situacao.tarefa.estado} />
                      {item.situacao.tarefa.estado !== "triagem" && item.situacao.tarefa.responsavelId
                        ? `Aviso no WhatsApp de ${nomeDe(item.situacao.tarefa.responsavelId)}`
                        : "Falta definir antes de alguém ser avisado"}
                    </p>
                  </div>
                  <Link href={`/tarefa/${item.situacao.tarefa.id}`} className="dl-btn dl-btn-secondary">
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
