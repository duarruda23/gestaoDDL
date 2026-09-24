"use client";

import Link from "next/link";
import { useGestao } from "@/lib/store";
import type { Tarefa } from "@/lib/types";
import { estaAtiva, estaVencida, ordenarPorUrgencia, venceEmBreve } from "@/lib/regras";
import { CartaoTarefa, Contador, TituloPagina, TituloSecao, Vazio } from "@/components/ui";

function Grupo({ titulo, tarefas, vazio }: { titulo: string; tarefas: Tarefa[]; vazio: string }) {
  return (
    <section className="dl-column flex flex-col gap-2">
      <p className="dl-eyebrow">{titulo}</p>
      {tarefas.length ? tarefas.map((t) => <CartaoTarefa key={t.id} tarefa={t} compacto />) : <Vazio>{vazio}</Vazio>}
    </section>
  );
}

export default function Painel() {
  const { tarefas, usuarios, mensagens } = useGestao();

  const ativas = tarefas.filter(estaAtiva).sort(ordenarPorUrgencia);
  const vencidas = ativas.filter((t) => estaVencida(t));
  const semDono = ativas.filter((t) => !t.responsavelId || t.estado === "triagem");
  const bloqueadas = ativas.filter((t) => t.estado === "bloqueada");
  const vencendo = ativas.filter((t) => venceEmBreve(t) && t.estado !== "bloqueada");
  const falhas = mensagens.filter((m) => m.status === "falhou");
  const manuais = mensagens.filter((m) => m.regra === "cobranca_manual" && m.autorId);

  const porPessoa = usuarios
    .filter((u) => u.ativo)
    .map((u) => {
      const faz = ativas.filter((t) => t.responsavelId === u.id);
      const pediu = ativas.filter((t) => t.criadorId === u.id && t.responsavelId !== u.id);
      return {
        u,
        faz: faz.length,
        vencidasFaz: faz.filter((t) => estaVencida(t)).length,
        pediu: pediu.length,
        cobrou: manuais.filter((m) => m.autorId === u.id).length,
        cobrado: manuais.filter((m) => m.destinatarioId === u.id).length,
      };
    })
    .sort((a, b) => b.vencidasFaz - a.vencidasFaz || b.faz - a.faz);

  return (
    <div className="flex flex-col gap-8">
      <TituloPagina
        chapeu="Painel"
        titulo="Como está a equipe"
        subtitulo="O mesmo painel para todo mundo, o Ítalo incluído. Primeiro o que precisa de ação."
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Contador valor={vencidas.length} rotulo="Vencidas" tom="danger" />
        <Contador valor={vencendo.length} rotulo="Vencem hoje ou amanhã" tom="warning" />
        <Contador href="/triagem" valor={semDono.length} rotulo="Sem dono ou na triagem" tom="warning" />
        <Contador valor={bloqueadas.length} rotulo="Bloqueadas" tom="danger" />
      </section>

      {falhas.length > 0 && (
        <Link href="/cobrancas" className="dl-callout dl-callout-danger block">
          <p className="dl-callout-title">{falhas.length} mensagem(ns) de WhatsApp falharam</p>
          Ver a fila de cobranças →
        </Link>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Grupo titulo="Vencidas" tarefas={vencidas} vazio="Nada vencido." />
        <Grupo titulo="Sem dono" tarefas={semDono} vazio="Tudo tem responsável." />
        <Grupo titulo="Bloqueadas" tarefas={bloqueadas} vazio="Nada travado." />
        <Grupo titulo="Vencem hoje ou amanhã" tarefas={vencendo} vazio="Nada vencendo." />
      </div>

      <section>
        <TituloSecao>Pessoa por pessoa</TituloSecao>
        <div className="dl-panel !p-0 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="dl-field-label p-3">Pessoa</th>
                <th className="dl-field-label p-3 text-right">Com ela</th>
                <th className="dl-field-label p-3 text-right">Vencidas com ela</th>
                <th className="dl-field-label p-3 text-right">Pediu, em aberto</th>
                <th className="dl-field-label p-3 text-right">Cobrou</th>
                <th className="dl-field-label p-3 text-right">Foi cobrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {porPessoa.map((x) => (
                <tr key={x.u.id}>
                  <td className="p-3 font-bold">{x.u.nome}</td>
                  <td className="p-3 text-right">{x.faz}</td>
                  <td className={`p-3 text-right ${x.vencidasFaz ? "font-extrabold text-danger" : "text-ink-subtle"}`}>{x.vencidasFaz}</td>
                  <td className="p-3 text-right">{x.pediu}</td>
                  <td className="p-3 text-right text-ink-muted">{x.cobrou}</td>
                  <td className="p-3 text-right text-ink-muted">{x.cobrado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
