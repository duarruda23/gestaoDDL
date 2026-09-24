"use client";

import Link from "next/link";
import { useGestao } from "@/lib/store";
import { estaAtiva, estaVencida, ordenarPorUrgencia } from "@/lib/regras";
import { diaSemana, formatarDataHora, hojeISO } from "@/lib/datas";
import { BotaoLink, CartaoTarefa, Contador, TituloPagina, TituloSecao, Vazio } from "@/components/ui";
import { Cobrar } from "@/components/Cobrar";

export default function Inicio() {
  const { usuarioAtual, tarefas, mensagens, usuarios } = useGestao();
  if (!usuarioAtual) return null;

  const hoje = hojeISO();
  const eu = usuarioAtual.id;
  const minhas = tarefas.filter((t) => t.responsavelId === eu && estaAtiva(t)).sort(ordenarPorUrgencia);
  const atrasadas = minhas.filter((t) => estaVencida(t));
  const proximas = minhas.filter((t) => !estaVencida(t) && t.estado !== "bloqueada");
  const bloqueadas = minhas.filter((t) => t.estado === "bloqueada");
  const pedi = tarefas
    .filter((t) => t.criadorId === eu && t.responsavelId !== eu && estaAtiva(t))
    .sort(ordenarPorUrgencia);
  const meCobraram = mensagens
    .filter((m) => m.regra === "cobranca_manual" && m.destinatarioId === eu)
    .slice(0, 5);
  const nome = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? "?";

  return (
    <div className="flex flex-col gap-8">
      <TituloPagina
        chapeu={`Hoje é ${diaSemana(hoje)}`}
        titulo={`Olá, ${usuarioAtual.nome}`}
        subtitulo="O que está com você, o que você pediu para os outros e quem te cobrou."
        acao={
          <BotaoLink href="/nova" variant="primary">
            Pedir algo
          </BotaoLink>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Contador valor={minhas.length} rotulo="Com você" />
        <Contador valor={atrasadas.length} rotulo="Vencidas com você" tom="danger" />
        <Contador valor={pedi.length} rotulo="Você pediu, em aberto" />
        <Contador valor={pedi.filter((t) => estaVencida(t)).length} rotulo="Você pediu, vencidas" tom="warning" />
      </section>

      {meCobraram.length > 0 && (
        <section>
          <TituloSecao>Te cobraram</TituloSecao>
          <ul className="flex flex-col gap-2">
            {meCobraram.map((m) => (
              <li key={m.id} className="dl-panel !p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{nome(m.autorId)}</strong> cobrou{" "}
                  {m.tarefaId ? (
                    <Link href={`/tarefa/${m.tarefaId}`} className="dl-link">
                      {tarefas.find((t) => t.id === m.tarefaId)?.titulo ?? "uma tarefa"}
                    </Link>
                  ) : (
                    "uma tarefa"
                  )}
                </span>
                <span className="text-xs text-ink-subtle">{formatarDataHora(m.criadoEm)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {atrasadas.length > 0 && (
        <section>
          <TituloSecao tom="danger">Vencidas com você</TituloSecao>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {atrasadas.map((t) => (
              <CartaoTarefa key={t.id} tarefa={t} />
            ))}
          </div>
        </section>
      )}

      <section>
        <TituloSecao>Próximas com você</TituloSecao>
        {proximas.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {proximas.map((t) => (
              <CartaoTarefa key={t.id} tarefa={t} />
            ))}
          </div>
        ) : (
          <Vazio>Nada pendente com você.</Vazio>
        )}
      </section>

      {bloqueadas.length > 0 && (
        <section>
          <TituloSecao>Bloqueadas com você</TituloSecao>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bloqueadas.map((t) => (
              <CartaoTarefa key={t.id} tarefa={t} />
            ))}
          </div>
        </section>
      )}

      <section>
        <TituloSecao>Você pediu</TituloSecao>
        {pedi.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pedi.map((t) => (
              <div key={t.id} className="flex flex-col gap-2">
                <CartaoTarefa tarefa={t} />
                <Cobrar tarefa={t} compacto />
              </div>
            ))}
          </div>
        ) : (
          <Vazio>Você não tem pedidos em aberto com outras pessoas.</Vazio>
        )}
      </section>
    </div>
  );
}
