"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useGestao } from "@/lib/store";
import { Avatar } from "./ui";

const ITENS = [
  { href: "/", rotulo: "Início" },
  { href: "/nova", rotulo: "Pedir" },
  { href: "/quadro", rotulo: "Quadro" },
  { href: "/triagem", rotulo: "Triagem" },
  { href: "/painel", rotulo: "Painel" },
  { href: "/cobrancas", rotulo: "Cobranças" },
  { href: "/equipe", rotulo: "Equipe" },
];

const CHAVE_TEMA = "gestao-donas:tema";

function ativo(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function useTema(): ["dark" | "light", (t: "dark" | "light") => void] {
  const [tema, setTema] = useState<"dark" | "light">("dark");
  useEffect(() => {
    // O tema já foi aplicado pelo script do layout; aqui só sincroniza o botão.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTema(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  function trocar(t: "dark" | "light") {
    setTema(t);
    if (t === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(CHAVE_TEMA, t);
    } catch {
      // sem localStorage o tema vale só nesta aba
    }
  }
  return [tema, trocar];
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { usuarioAtual, sair, tarefas } = useGestao();
  const [tema, setTema] = useTema();
  const naTriagem = tarefas.filter((t) => t.estado === "triagem").length;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 pb-2 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3" aria-label="Gestão Donas de Loja, início">
          {tema === "dark" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo-donas-de-loja.webp" alt="Donas de Loja" width={177} height={44} className="h-9 w-auto" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/icone-donas-de-loja.png" alt="Donas de Loja" width={36} height={35} className="h-9 w-auto" />
          )}
          <span className="hidden sm:block border-l border-line pl-3 text-xs font-extrabold uppercase tracking-[0.1em] text-brand-text">
            Gestão
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="dl-btn dl-btn-ghost !min-h-9 !px-3"
            onClick={() => setTema(tema === "dark" ? "light" : "dark")}
            aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}
          >
            {tema === "dark" ? "Claro" : "Escuro"}
          </button>
          {usuarioAtual && (
            <>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Avatar nome={usuarioAtual.nome} />
                <span className="hidden sm:inline">{usuarioAtual.nome}</span>
              </span>
              <button
                type="button"
                className="dl-btn dl-btn-secondary !min-h-9 !px-3"
                onClick={() => {
                  sair();
                  router.push("/entrar");
                }}
              >
                Trocar
              </button>
            </>
          )}
        </div>
      </div>

      {usuarioAtual && (
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 pb-2 flex gap-1 overflow-x-auto" aria-label="Seções">
          {ITENS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="dl-nav-link"
              aria-current={ativo(pathname, item.href) ? "page" : undefined}
            >
              {item.rotulo}
              {item.href === "/triagem" && naTriagem > 0 && (
                <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 text-xs text-ink">{naTriagem}</span>
              )}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
