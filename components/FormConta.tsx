"use client";

import { useState } from "react";
import { useGestao } from "@/lib/store";
import type { Usuario } from "@/lib/types";
import { Botao, Campo } from "./ui";

// Criar conta: qualquer pessoa da equipe pode cadastrar outra (modelo
// horizontal). No sistema real vira convite por link com expiração.
export function FormConta({ onCriada }: { onCriada: (u: Usuario) => void }) {
  const { frentes, criarConta } = useGestao();
  const [nome, setNome] = useState("");
  const [funcao, setFuncao] = useState("");
  const [telefone, setTelefone] = useState("");
  const [frenteIds, setFrenteIds] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  function alternarFrente(id: string) {
    setFrenteIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const r = criarConta({ nome, funcao, telefone, frenteIds });
    if (!r.ok) {
      setErro(r.motivo);
      return;
    }
    setErro(null);
    setNome("");
    setFuncao("");
    setTelefone("");
    setFrenteIds([]);
    onCriada(r.usuario);
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="conta-nome" rotulo="Nome">
          <input id="conta-nome" className="dl-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como a equipe te chama" autoComplete="name" />
        </Campo>
        <Campo id="conta-funcao" rotulo="O que você faz">
          <input id="conta-funcao" className="dl-input" value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="Ex.: Edição de vídeo" />
        </Campo>
      </div>
      <Campo id="conta-whats" rotulo="WhatsApp" ajuda="É por aqui que chegam as cobranças e os avisos de tarefa.">
        <input id="conta-whats" className="dl-input" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="+55 82 99999-0000" inputMode="tel" autoComplete="tel" />
      </Campo>
      <fieldset className="flex flex-col gap-2">
        <legend className="dl-field-label mb-2">Frentes em que trabalha</legend>
        <div className="flex flex-wrap gap-2">
          {frentes.map((f) => {
            const marcada = frenteIds.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={marcada}
                onClick={() => alternarFrente(f.id)}
                className={`dl-btn !min-h-9 ${marcada ? "dl-btn-primary !normal-case !tracking-normal !text-[13px]" : "dl-btn-secondary"}`}
              >
                {f.nome}
              </button>
            );
          })}
        </div>
      </fieldset>
      {erro && <p className="text-sm font-semibold text-danger">{erro}</p>}
      <div>
        <Botao type="submit" variant="primary">
          Criar conta
        </Botao>
      </div>
    </form>
  );
}
