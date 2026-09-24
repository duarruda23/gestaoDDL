"use client";

import { useState } from "react";
import { useGestao } from "@/lib/store";
import { estaAtiva } from "@/lib/regras";
import { formatarDataHora } from "@/lib/datas";
import { FormConta } from "@/components/FormConta";
import { Acessos } from "@/components/Acessos";
import { Avatar, Botao, TituloPagina, TituloSecao } from "@/components/ui";

export default function Equipe() {
  const { usuarioAtual, usuarios, frentes, tarefas, resetar } = useGestao();
  const [criada, setCriada] = useState<string | null>(null);
  const [confirmandoReset, setConfirmandoReset] = useState(false);
  if (!usuarioAtual) return null;

  const nome = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? "—";

  return (
    <div className="flex flex-col gap-8">
      <TituloPagina
        chapeu="Equipe"
        titulo="Contas da equipe"
        subtitulo="Todo mundo tem a mesma conta: pede, faz, cobra e é cobrado. A única exceção é remover acessos, que fica com o Ítalo e quem ele autorizar."
      />

      <section className="dl-panel !p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="dl-field-label p-3">Pessoa</th>
              <th className="dl-field-label p-3">O que faz</th>
              <th className="dl-field-label p-3">Frentes</th>
              <th className="dl-field-label p-3">WhatsApp</th>
              <th className="dl-field-label p-3 text-right">Ativas</th>
              <th className="dl-field-label p-3">Conta criada por</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {usuarios.filter((u) => u.ativo).map((u) => (
              <tr key={u.id}>
                <td className="p-3">
                  <span className="flex items-center gap-2 font-bold">
                    <Avatar nome={u.nome} /> {u.nome}
                    {u.id === usuarioAtual.id && <span className="text-xs font-semibold text-ink-subtle">(você)</span>}
                  </span>
                </td>
                <td className="p-3 text-ink-muted">{u.funcao}</td>
                <td className="p-3 text-ink-muted">{u.frenteIds.map((id) => frentes.find((f) => f.id === id)?.nome).join(", ") || "—"}</td>
                <td className="p-3 text-ink-muted whitespace-nowrap">
                  {u.telefone}
                  {u.cobrancaPausada && <span className="ml-2 text-xs">(pausado)</span>}
                </td>
                <td className="p-3 text-right tabular-nums">{tarefas.filter((t) => t.responsavelId === u.id && estaAtiva(t)).length}</td>
                <td className="p-3 text-xs text-ink-subtle">
                  {nome(u.criadoPorId)}
                  {u.criadoEm && ` · ${formatarDataHora(u.criadoEm)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Acessos />

      <section className="dl-panel !p-5 sm:!p-6 max-w-3xl">
        <p className="dl-eyebrow">Nova conta</p>
        <h2 className="mt-1 mb-4 text-xl font-extrabold">Cadastrar alguém da equipe</h2>
        <FormConta onCriada={(u) => setCriada(u.nome)} />
        {criada && <p className="mt-3 text-sm font-semibold text-success">Conta de {criada} criada. Ela já pode entrar e receber pedidos.</p>}
      </section>

      <section className="max-w-3xl">
        <TituloSecao>Dados da demonstração</TituloSecao>
        <p className="-mt-1 mb-3 text-sm text-ink-muted">As alterações ficam salvas só neste navegador. Restaure antes de uma apresentação.</p>
        {confirmandoReset ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-danger">Isso apaga tarefas e contas criadas neste navegador.</span>
            <Botao variant="danger" onClick={() => { resetar(); setConfirmandoReset(false); }}>
              Restaurar agora
            </Botao>
            <Botao variant="ghost" onClick={() => setConfirmandoReset(false)}>
              Cancelar
            </Botao>
          </div>
        ) : (
          <Botao variant="secondary" onClick={() => setConfirmandoReset(true)}>
            Restaurar dados de demonstração
          </Botao>
        )}
      </section>
    </div>
  );
}
