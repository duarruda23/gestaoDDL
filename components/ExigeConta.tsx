"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useGestao } from "@/lib/store";

// Sem conta escolhida, toda tela manda para /entrar. No sistema real isso é a
// sessão do servidor; aqui é só a conta lembrada no navegador.
export function ExigeConta({ children }: { children: React.ReactNode }) {
  const { carregado, usuarioAtual } = useGestao();
  const pathname = usePathname();
  const router = useRouter();
  const naEntrada = pathname === "/entrar";

  useEffect(() => {
    if (carregado && !usuarioAtual && !naEntrada) router.replace("/entrar");
  }, [carregado, usuarioAtual, naEntrada, router]);

  if (!carregado) return <p className="p-6 text-sm text-ink-subtle">Carregando...</p>;
  if (!usuarioAtual && !naEntrada) return null;
  return <>{children}</>;
}
