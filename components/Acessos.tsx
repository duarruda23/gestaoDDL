"use client";

import { useState } from "react";
import { useGestao } from "@/lib/store";
import type { Usuario } from "@/lib/types";
import { ehDono, estaAtiva, podeDelegarAcessos, podeGerenciarAcessos } from "@/lib/regras";
import { formatarDataHora } from "@/lib/datas";
import { Avatar, Botao, TituloSecao, Vazio } from "./ui";

// Remover acesso é a única função que não é de todo mundo: só o Ítalo e
// quem ele autorizar. Remover não apaga a conta: o histórico continua e o
// acesso pode ser restaurado.

function LinhaConta({ u }: { u: Usuario }) {
  const { usuarioAtual, tarefas, removerAcesso, definirGerenciaAcessos } = useGestao();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const gerencio = podeGerenciarAcessos(usuarioAtual);
  const souDono = podeDelegarAcessos(usuarioAtual);
  const dono = ehDono(u);
  const souEu = u.id === usuarioAtual?.id;
  const abertas = tarefas.filter((t) => t.responsavelId === u.id && estaAtiva(t)).length;
  const podeRemover = gerencio && !dono && !souEu && (!u.gerenciaAcessos || souDono);

  function remover() {
    const r = removerAcesso(u.id, motivo);
    if (r.ok) {
      setConfirmando(false);
      setMotivo("");
      setErro(null);
    } else setErro(r.motivo);
  }

  function alternarPermissao() {
    const r = definirGerenciaAcessos(u.id, !u.gerenciaAcessos);
    setErro(r.ok ? null : r.motivo);
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-bold">
          <Avatar nome={u.nome} />
          {u.nome}
          {souEu && <span className="text-xs font-semibold text-ink-subtle">(você)</span>}
          {dono ? (
            <span className="dl-tag dl-tag-media">Dono</span>
          ) : u.gerenciaAcessos ? (
            <span className="dl-tag dl-tag-ia">Gerencia acessos</span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {souDono && !dono && (
            <Botao variant="ghost" onClick={alternarPermissao}>
              {u.gerenciaAcessos ? "Tirar permissão de acessos" : "Dar permissão de acessos"}
            </Botao>
          )}
          {podeRemover && !confirmando && (
            <Botao variant="danger" onClick={() => setConfirmando(true)}>
              Remover acesso
            </Botao>
          )}
        </span>
      </div>
      {confirmando && (
        <div className="dl-surgir dl-callout dl-callout-danger flex flex-col gap-3">
          <p className="dl-callout-title">Remover o acesso de {u.nome}?</p>
          <p>
            {u.nome} deixa de entrar no sistema e de receber mensagens.{" "}
            {abertas > 0
              ? `${abertas} tarefa(s) aberta(s) com ${u.nome} voltam para a triagem, sem dono.`
              : `${u.nome} não tem tarefas abertas.`}{" "}
            O histórico continua, e o acesso pode ser restaurado depois.
          </p>
          <input
            className="dl-input"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (opcional), ex.: saiu da equipe"
            aria-label={`Motivo para remover o acesso de ${u.nome}`}
          />
          <div className="flex flex-wrap gap-2">
            <Botao variant="danger" onClick={remover}>
              Remover acesso de {u.nome}
            </Botao>
            <Botao variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}
      {erro && <p className="text-xs font-semibold text-danger">{erro}</p>}
    </li>
  );
}

export function Acessos() {
  const { usuarioAtual, usuarios, restaurarAcesso } = useGestao();
  const [erro, setErro] = useState<string | null>(null);
  const gerencio = podeGerenciarAcessos(usuarioAtual);
  const ativos = usuarios.filter((u) => u.ativo);
  const removidos = usuarios.filter((u) => !u.ativo);
  const gestores = ativos.filter((u) => ehDono(u) || u.gerenciaAcessos).map((u) => u.nome);
  const nome = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? "—";

  return (
    <section className="max-w-3xl">
      <TituloSecao>Acessos</TituloSecao>
      <p className="-mt-1 mb-4 text-sm text-ink-muted">
        Remover o acesso de alguém é a única coisa que não é de todo mundo. Quem pode: <strong className="text-ink">{gestores.join(", ")}</strong>.
        {podeDelegarAcessos(usuarioAtual) && " Como dono, você decide quem mais pode."}
        {!gerencio && " Se alguém precisa sair, fale com o Ítalo."}
      </p>

      <div className="dl-panel">
        <ul className="divide-y divide-line">
          {ativos.map((u) => (
            <LinhaConta key={u.id} u={u} />
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <p className="dl-eyebrow mb-3">Sem acesso</p>
        {removidos.length ? (
          <ul className="flex flex-col gap-2">
            {removidos.map((u) => (
              <li key={u.id} className="dl-panel !p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{u.nome}</strong>
                  <span className="text-ink-muted">
                    {" "}· removido por {nome(u.acessoRemovidoPorId)}
                    {u.acessoRemovidoEm && ` em ${formatarDataHora(u.acessoRemovidoEm)}`}
                  </span>
                </span>
                {gerencio && (
                  <Botao
                    variant="secondary"
                    onClick={() => {
                      const r = restaurarAcesso(u.id);
                      setErro(r.ok ? null : r.motivo);
                    }}
                  >
                    Restaurar acesso
                  </Botao>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Vazio>Ninguém está sem acesso.</Vazio>
        )}
        {erro && <p className="mt-2 text-xs font-semibold text-danger">{erro}</p>}
      </div>
    </section>
  );
}
