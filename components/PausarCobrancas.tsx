"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { pausarCobrancasAcao } from "@/app/cobrancas/acoes";
import { Botao } from "./ui";

// Opt-out: cada pessoa decide se recebe cobranças no WhatsApp. Continua
// vendo tudo no sistema.
export function PausarCobrancas({ pausada, semWhatsapp }: { pausada: boolean; semWhatsapp: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [otimista, definir] = useOptimistic(pausada);

  function alternar() {
    iniciar(async () => {
      definir(!otimista);
      await pausarCobrancasAcao(!otimista);
    });
  }

  return (
    <div className="dl-panel flex flex-col gap-3 text-sm">
      <p className="dl-eyebrow">Suas cobranças no WhatsApp</p>
      {semWhatsapp ? (
        <p className="text-ink-muted">
          Você ainda não cadastrou seu WhatsApp, então as cobranças ficam só no sistema.{" "}
          <Link href="/equipe" className="dl-link">
            Cadastrar
          </Link>
        </p>
      ) : (
        <p className="text-ink-muted">
          {otimista ? "Pausadas: você não recebe mensagens, mas as cobranças continuam registradas nas tarefas." : "Ativas: quando alguém te cobrar, a mensagem chega no seu WhatsApp."}
        </p>
      )}
      <div>
        <Botao variant={otimista ? "primary" : "secondary"} disabled={pendente} onClick={alternar}>
          {otimista ? "Voltar a receber" : "Pausar minhas cobranças"}
        </Botao>
      </div>
    </div>
  );
}
