"use client";

import Link from "next/link";
import { useEffect } from "react";

// Tela de erro amigável. Aparece, por exemplo, quando a internet cai no meio
// de uma ação (o envio não chega ao servidor e nada é gravado).
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const semInternet = typeof navigator !== "undefined" && !navigator.onLine;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 pt-10">
      <p className="dl-eyebrow">{semInternet ? "Sem conexão" : "Algo deu errado"}</p>
      <h1 className="dl-heading">{semInternet ? "A internet caiu" : "Não deu para concluir"}</h1>
      <p className="dl-subheading">
        {semInternet
          ? "Nada foi salvo. Quando a conexão voltar, tente de novo."
          : "Pode ter sido a conexão. Tente de novo; se continuar, avise o Eduardo."}
      </p>
      <div className="flex gap-2">
        <button type="button" className="dl-btn dl-btn-primary" onClick={reset}>
          Tentar de novo
        </button>
        <Link href="/" className="dl-btn dl-btn-secondary">
          Ir para o início
        </Link>
      </div>
      {error.digest && <p className="text-xs text-ink-subtle">Código do erro: {error.digest}</p>}
    </div>
  );
}
