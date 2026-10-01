"use client";

import { useActionState, useState } from "react";
import { permissaoAcao, removerAcessoAcao, restaurarAcessoAcao, type EstadoAcao } from "@/app/equipe/acoes";
import { Avatar, Botao, Vazio } from "../ui";

// Lista de acessos da tela Equipe. O servidor decide o que cada pessoa pode
// fazer (as flags chegam prontas); as ações são checadas de novo no servidor.

export interface PessoaAcesso {
  id: string;
  nome: string;
  funcao: string;
  email: string;
  whatsapp: string;
  dono: boolean;
  gerenciaAcessos: boolean;
  tarefasAbertas: number;
  souEu: boolean;
  podeRemover: boolean;
  podeMudarPermissao: boolean;
}

export interface PessoaSemAcesso {
  id: string;
  nome: string;
  removidoPor: string;
  removidoEm: string;
}

const INICIAL: EstadoAcao = { ok: false, mensagem: null };

function LinhaPessoa({ p }: { p: PessoaAcesso }) {
  const [confirmando, setConfirmando] = useState(false);
  const [remocao, removerAcao, removendo] = useActionState(removerAcessoAcao, INICIAL);
  const [permissao, mudarPermissao, mudando] = useActionState(permissaoAcao, INICIAL);

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <Avatar nome={p.nome} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-bold">
              {p.nome}
              {p.souEu && <span className="text-xs font-semibold text-ink-subtle">(você)</span>}
              {p.dono ? (
                <span className="dl-tag dl-tag-media">Dono</span>
              ) : p.gerenciaAcessos ? (
                <span className="dl-tag dl-tag-ia">Gerencia acessos</span>
              ) : null}
            </span>
            <span className="block truncate text-xs text-ink-muted">
              {[p.funcao, p.email, p.whatsapp || "sem WhatsApp"].filter(Boolean).join(" · ")}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {p.podeMudarPermissao && (
            <form action={mudarPermissao}>
              <input type="hidden" name="alvoId" value={p.id} />
              <input type="hidden" name="pode" value={p.gerenciaAcessos ? "nao" : "sim"} />
              <Botao type="submit" variant="ghost" disabled={mudando}>
                {p.gerenciaAcessos ? "Tirar permissão de acessos" : "Dar permissão de acessos"}
              </Botao>
            </form>
          )}
          {p.podeRemover && !confirmando && (
            <Botao variant="danger" onClick={() => setConfirmando(true)}>
              Remover acesso
            </Botao>
          )}
        </span>
      </div>

      {confirmando && (
        <form action={removerAcao} className="dl-surgir dl-callout dl-callout-danger flex flex-col gap-3">
          <input type="hidden" name="alvoId" value={p.id} />
          <p className="dl-callout-title">Remover o acesso de {p.nome}?</p>
          <p>
            {p.nome} deixa de entrar no sistema e de receber mensagens.{" "}
            {p.tarefasAbertas > 0
              ? `${p.tarefasAbertas} tarefa(s) aberta(s) com ${p.nome} voltam para a triagem, sem dono.`
              : `${p.nome} não tem tarefas abertas.`}{" "}
            O histórico continua, e o acesso pode ser restaurado depois.
          </p>
          <label className="sr-only" htmlFor={`motivo-${p.id}`}>
            Motivo
          </label>
          <input id={`motivo-${p.id}`} name="motivo" className="dl-input" placeholder="Motivo (opcional), ex.: saiu da equipe" />
          <div className="flex flex-wrap gap-2">
            <Botao type="submit" variant="danger" disabled={removendo}>
              {removendo ? "Removendo..." : `Remover acesso de ${p.nome}`}
            </Botao>
            <Botao variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Botao>
          </div>
          {!remocao.ok && remocao.mensagem && <p className="text-sm font-semibold">{remocao.mensagem}</p>}
        </form>
      )}
      {!permissao.ok && permissao.mensagem && <p className="text-xs font-semibold text-danger">{permissao.mensagem}</p>}
    </li>
  );
}

function LinhaSemAcesso({ p, podeRestaurar }: { p: PessoaSemAcesso; podeRestaurar: boolean }) {
  const [estado, acao, restaurando] = useActionState(restaurarAcessoAcao, INICIAL);
  return (
    <li className="dl-panel !p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>
        <strong>{p.nome}</strong>
        <span className="text-ink-muted">
          {" "}· removido por {p.removidoPor} em {p.removidoEm}
        </span>
      </span>
      {podeRestaurar && (
        <form action={acao} className="flex items-center gap-2">
          <input type="hidden" name="alvoId" value={p.id} />
          <Botao type="submit" variant="secondary" disabled={restaurando}>
            {restaurando ? "Restaurando..." : "Restaurar acesso"}
          </Botao>
        </form>
      )}
      {!estado.ok && estado.mensagem && <p className="w-full text-xs font-semibold text-danger">{estado.mensagem}</p>}
    </li>
  );
}

export function ListaAcessos({
  pessoas,
  semAcesso,
  gestores,
  gerencio,
  souDono,
}: {
  pessoas: PessoaAcesso[];
  semAcesso: PessoaSemAcesso[];
  gestores: string[];
  gerencio: boolean;
  souDono: boolean;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="dl-eyebrow">Acessos</p>
        <p className="mt-1 text-sm text-ink-muted">
          Tirar o acesso de alguém é a única coisa que não é de todo mundo. Quem pode:{" "}
          <strong className="text-ink">{gestores.join(", ")}</strong>.
          {souDono ? " Como dono, você decide quem mais pode." : !gerencio ? " Se alguém precisa sair, fale com o Ítalo." : ""}
        </p>
      </div>
      <div className="dl-panel">
        <ul className="divide-y divide-line">
          {pessoas.map((p) => (
            <LinhaPessoa key={p.id} p={p} />
          ))}
        </ul>
      </div>
      <div>
        <p className="dl-eyebrow mb-3">Sem acesso</p>
        {semAcesso.length ? (
          <ul className="flex flex-col gap-2">
            {semAcesso.map((p) => (
              <LinhaSemAcesso key={p.id} p={p} podeRestaurar={gerencio} />
            ))}
          </ul>
        ) : (
          <Vazio>Ninguém está sem acesso.</Vazio>
        )}
      </div>
    </section>
  );
}
