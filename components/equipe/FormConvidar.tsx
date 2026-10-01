"use client";

import { useActionState, useState } from "react";
import { convidar, type EstadoConvite } from "@/app/equipe/acoes";
import { Botao, Campo } from "../ui";

const INICIAL: EstadoConvite = { ok: false, mensagem: null, link: null, nome: "", whatsapp: "", redefinir: false };

// Convidar alguém: gera um link de uso único (72h) que a pessoa abre para
// criar a senha. Nesta fase o link vai à mão pelo WhatsApp; o envio
// automático entra junto com as cobranças (bloco C).
export function FormConvidar({ podeRedefinir }: { podeRedefinir: boolean }) {
  const [estado, acao, gerando] = useActionState<EstadoConvite, FormData>(convidar, INICIAL);
  const [copiado, setCopiado] = useState(false);
  const [chave, setChave] = useState(0); // limpa o formulário para um novo convite
  const [dispensado, setDispensado] = useState<string | null>(null); // link já fechado pela pessoa

  const mensagemWhats = estado.link
    ? `Oi, ${estado.nome.split(" ")[0]}! ${estado.redefinir ? "Aqui está o link para você criar uma nova senha" : "Aqui está o seu convite"} para o sistema de gestão do Donas de Loja: ${estado.link} (vale 72 horas).`
    : "";
  const numero = estado.whatsapp.replace(/\D/g, "");

  async function copiar() {
    if (!estado.link) return;
    try {
      await navigator.clipboard.writeText(estado.link);
      setCopiado(true);
    } catch {
      // Sem acesso à área de transferência: o link continua visível para copiar à mão.
    }
  }

  if (estado.ok && estado.link && estado.link !== dispensado) {
    return (
      <div className="dl-panel !p-5 sm:!p-6 flex flex-col gap-4 dl-surgir">
        <div>
          <p className="dl-eyebrow">{estado.redefinir ? "Link para nova senha" : "Convite criado"}</p>
          <p className="mt-1 text-sm text-ink-muted">
            Mande este link para <strong className="text-ink">{estado.nome}</strong>. Ele vale por 72 horas, funciona uma vez só e{" "}
            <strong className="text-ink">não aparece de novo</strong> depois que você sair daqui.
          </p>
        </div>
        <code className="block break-all rounded-[var(--radius-lg)] bg-surface-input p-3 text-xs text-ink">{estado.link}</code>
        <div className="flex flex-wrap gap-2">
          {numero.length >= 10 && (
            <a
              className="dl-btn dl-btn-success"
              href={`https://wa.me/${numero}?text=${encodeURIComponent(mensagemWhats)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Mandar no WhatsApp
            </a>
          )}
          <Botao variant="secondary" onClick={copiar}>
            {copiado ? "Link copiado" : "Copiar link"}
          </Botao>
          <Botao
            variant="ghost"
            onClick={() => {
              setCopiado(false);
              setDispensado(estado.link);
              setChave((k) => k + 1);
            }}
          >
            Convidar outra pessoa
          </Botao>
        </div>
      </div>
    );
  }

  return (
    <form key={chave} action={acao} className="dl-panel !p-5 sm:!p-6 flex flex-col gap-4">
      <div>
        <p className="dl-eyebrow">Convidar para a equipe</p>
        <p className="mt-1 text-sm text-ink-muted">
          Qualquer pessoa da equipe pode convidar.
          {podeRedefinir
            ? " Usando o e-mail de alguém que já tem conta, o link serve para a pessoa criar uma nova senha."
            : " Esqueceu a senha? Quem redefine é o Ítalo."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="cv-nome" rotulo="Nome">
          <input id="cv-nome" name="nome" className="dl-input" defaultValue={estado.ok ? "" : estado.nome} required />
        </Campo>
        <Campo id="cv-email" rotulo="E-mail (vai ser o login)">
          <input id="cv-email" name="email" type="email" className="dl-input" required inputMode="email" />
        </Campo>
        <Campo id="cv-whats" rotulo="WhatsApp">
          <input id="cv-whats" name="whatsapp" className="dl-input" defaultValue={estado.ok ? "" : estado.whatsapp} placeholder="+55 82 99999-0000" inputMode="tel" required />
        </Campo>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variant="primary" disabled={gerando}>
          {gerando ? "Gerando..." : "Gerar convite"}
        </Botao>
        {!estado.ok && estado.mensagem && (
          <span className="text-sm font-semibold text-danger" role="alert">
            {estado.mensagem}
          </span>
        )}
      </div>
    </form>
  );
}
