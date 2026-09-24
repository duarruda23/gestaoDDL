"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGestao } from "@/lib/store";
import { estaAtiva, estaVencida } from "@/lib/regras";
import { FormConta } from "@/components/FormConta";
import { Avatar, Botao, TituloPagina } from "@/components/ui";

export default function Entrar() {
  const { usuarios, tarefas, entrar, usuarioAtualId } = useGestao();
  const removido = usuarios.find((u) => u.id === usuarioAtualId && !u.ativo);
  const router = useRouter();
  const [criando, setCriando] = useState(false);

  function escolher(id: string) {
    entrar(id);
    router.push("/");
  }

  return (
    <div className="max-w-3xl mx-auto">
      <TituloPagina
        chapeu="Equipe Donas de Loja"
        titulo="Quem é você?"
        subtitulo="Aqui todo mundo pede, entrega e cobra todo mundo, o Ítalo incluído. Entre na sua conta para ver o que está com você."
      />

      {removido && (
        <div className="dl-callout dl-callout-danger mb-5" role="alert">
          <p className="dl-callout-title">O acesso de {removido.nome} foi removido</p>
          Fale com o Ítalo se isso foi um engano.
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {usuarios.filter((u) => u.ativo).map((u) => {
          const minhas = tarefas.filter((t) => t.responsavelId === u.id && estaAtiva(t));
          const vencidas = minhas.filter((t) => estaVencida(t)).length;
          return (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => escolher(u.id)}
                className="dl-card w-full text-left flex items-center gap-3 cursor-pointer"
              >
                <Avatar nome={u.nome} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold">{u.nome}</span>
                  <span className="block text-xs text-ink-muted truncate">{u.funcao}</span>
                </span>
                <span className="text-right text-xs tabular-nums">
                  <span className="block text-ink-muted">{minhas.length} ativas</span>
                  {vencidas > 0 && <span className="block font-bold text-danger">{vencidas} vencidas</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <section className="mt-8 dl-panel">
        {criando ? (
          <>
            <p className="dl-eyebrow">Nova conta</p>
            <h2 className="mt-1 mb-4 text-xl font-extrabold">Criar conta na equipe</h2>
            <FormConta onCriada={(u) => escolher(u.id)} />
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">Não está na lista? Qualquer pessoa da equipe pode criar a própria conta.</p>
            <Botao variant="secondary" onClick={() => setCriando(true)}>
              Criar minha conta
            </Botao>
          </div>
        )}
      </section>
      <p className="mt-4 text-xs text-ink-subtle">
        No protótipo não há senha: a conta fica lembrada neste navegador. No sistema real, cada pessoa entra com a própria senha.
      </p>
    </div>
  );
}
