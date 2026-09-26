"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { ChartColumn, Ellipsis, House, Inbox, LayoutGrid, LogOut, MessageCircle, Moon, Plus, Sun, Users } from "lucide-react";
import { ROTAS, rotaPronta } from "@/lib/rotas";
import { Avatar } from "./ui";

// Navegação do sistema real: a conta vem do servidor (sessão) e sair é uma
// server action. Só aparecem as telas que já estão ligadas ao banco.

export interface ContaNav {
  nome: string;
}

type Sair = () => Promise<void>;

const CHAVE_TEMA = "gestao-donas:tema";

function ativo(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function useTema(): ["dark" | "light", () => void] {
  const [tema, setTema] = useState<"dark" | "light">("dark");
  useEffect(() => {
    // O tema já foi aplicado pelo script do layout; aqui só sincroniza o botão.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTema(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  function alternar() {
    const t = tema === "dark" ? "light" : "dark";
    setTema(t);
    if (t === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(CHAVE_TEMA, t);
    } catch {
      // sem localStorage o tema vale só nesta aba
    }
  }
  return [tema, alternar];
}

// Borda de rolagem: o esfumado sob o cabeçalho só aparece quando há conteúdo passando por baixo.
function useRolou(): boolean {
  const [rolou, setRolou] = useState(false);
  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 4);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);
  return rolou;
}

// Projeção de momento (WWDC 2018, "Designing Fluid Interfaces"): onde o gesto
// iria parar se continuasse, a partir da velocidade de soltura.
function projetar(velocidade: number, desaceleracao = 0.998): number {
  return ((velocidade / 1000) * desaceleracao) / (1 - desaceleracao);
}

const ITENS_MAIS = [
  { href: "/triagem", rotulo: "Triagem", icone: Inbox },
  { href: "/cobrancas", rotulo: "Cobranças", icone: MessageCircle },
  { href: "/equipe", rotulo: "Equipe e acessos", icone: Users },
];

const CLASSE_ITEM =
  "flex w-full items-center gap-3 rounded-[var(--radius-xl)] px-3 py-3.5 text-left text-[15px] font-semibold text-ink hover:bg-surface-section active:bg-surface-section aria-[current=page]:text-brand-text";

function FolhaMais({
  aberta,
  onFechar,
  tema,
  alternarTema,
  sair,
}: {
  aberta: boolean;
  onFechar: () => void;
  tema: "dark" | "light";
  alternarTema: () => void;
  sair: Sair;
}) {
  const pathname = usePathname();
  const reduzir = useReducedMotion();
  const [velocidadeSaida, setVelocidadeSaida] = useState(0);
  const folha = useRef<HTMLDivElement>(null);
  const itens = ITENS_MAIS.filter((i) => rotaPronta(i.href));

  useEffect(() => {
    if (!aberta) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVelocidadeSaida(0);
    // Foco no primeiro item da folha (link ou botão), para teclado e leitor de tela.
    folha.current?.querySelector<HTMLElement>("a, button")?.focus();
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberta, onFechar]);

  function aoSoltar(_: unknown, info: PanInfo) {
    // Decide pelo destino projetado, não pela posição de soltura: um peteleco curto fecha.
    if (info.offset.y + projetar(info.velocity.y) > 140) {
      setVelocidadeSaida(info.velocity.y); // a saída continua na velocidade do dedo
      onFechar();
    }
  }

  return (
    <AnimatePresence custom={velocidadeSaida}>
      {aberta && (
        <>
          <motion.div
            key="scrim"
            className="dl-scrim"
            onClick={onFechar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduzir ? 0.15 : 0.25 }}
          />
          <motion.div
            key="folha"
            ref={folha}
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
            className="dl-sheet"
            custom={velocidadeSaida}
            variants={{
              fora: reduzir ? { opacity: 0 } : { y: "100%" },
              dentro: reduzir
                ? { opacity: 1, transition: { duration: 0.15 } }
                : { y: 0, transition: { type: "spring", bounce: 0.15, duration: 0.35 } },
              // Sai pelo mesmo caminho por onde entrou, herdando a velocidade do gesto.
              saindo: (v: number) =>
                reduzir
                  ? { opacity: 0, transition: { duration: 0.15 } }
                  : { y: "100%", transition: { type: "spring", bounce: 0, duration: 0.3, velocity: v } },
            }}
            initial="fora"
            animate="dentro"
            exit="saindo"
            drag={reduzir ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.06, bottom: 1 }}
            onDragEnd={aoSoltar}
          >
            <div className="dl-sheet-alca" aria-hidden="true" />
            {itens.length > 0 && (
              <nav aria-label="Mais seções" className="flex flex-col">
                {itens.map((item) => {
                  const Icone = item.icone;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onFechar}
                      aria-current={ativo(pathname, item.href) ? "page" : undefined}
                      className={CLASSE_ITEM}
                    >
                      <Icone className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                      <span className="flex-1">{item.rotulo}</span>
                    </Link>
                  );
                })}
              </nav>
            )}
            <div className={`flex flex-col ${itens.length ? "mt-2 border-t border-line pt-2" : ""}`}>
              <button type="button" onClick={alternarTema} className={CLASSE_ITEM}>
                {tema === "dark" ? <Sun className="h-5 w-5 text-ink-muted" aria-hidden="true" /> : <Moon className="h-5 w-5 text-ink-muted" aria-hidden="true" />}
                {tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}
              </button>
              <form action={sair}>
                <button type="submit" className={CLASSE_ITEM}>
                  <LogOut className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                  Sair
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function BarraAbas({ tema, alternarTema, sair }: { tema: "dark" | "light"; alternarTema: () => void; sair: Sair }) {
  const pathname = usePathname();
  const [maisAberta, setMaisAberta] = useState(false);
  const fecharMais = useCallback(() => setMaisAberta(false), []);
  const noMais = ITENS_MAIS.some((i) => pathname.startsWith(i.href));
  const abas = [
    { href: "/", rotulo: "Início", icone: House },
    { href: "/quadro", rotulo: "Quadro", icone: LayoutGrid },
  ].filter((a) => rotaPronta(a.href));

  return (
    <>
      <nav className="dl-tabbar dl-chrome md:hidden" aria-label="Seções">
        {abas.map((a) => {
          const Icone = a.icone;
          return (
            <Link key={a.href} href={a.href} className="dl-tab" aria-current={ativo(pathname, a.href) ? "page" : undefined}>
              <Icone aria-hidden="true" />
              <span>{a.rotulo}</span>
            </Link>
          );
        })}
        {rotaPronta("/nova") && (
          <Link href="/nova" className="dl-tab dl-tab-pedir" aria-current={ativo(pathname, "/nova") ? "page" : undefined}>
            <span className="dl-tab-bolha">
              <Plus aria-hidden="true" />
            </span>
            <span>Pedir</span>
          </Link>
        )}
        {rotaPronta("/painel") && (
          <Link href="/painel" className="dl-tab" aria-current={ativo(pathname, "/painel") ? "page" : undefined}>
            <ChartColumn aria-hidden="true" />
            <span>Painel</span>
          </Link>
        )}
        <button
          type="button"
          className="dl-tab"
          aria-current={noMais ? "page" : undefined}
          aria-expanded={maisAberta}
          onClick={() => setMaisAberta(true)}
        >
          <Ellipsis aria-hidden="true" />
          <span>Mais</span>
        </button>
      </nav>
      <FolhaMais aberta={maisAberta} onFechar={fecharMais} tema={tema} alternarTema={alternarTema} sair={sair} />
    </>
  );
}

export function Nav({ conta, sair }: { conta: ContaNav | null; sair: Sair }) {
  const pathname = usePathname();
  const [tema, alternarTema] = useTema();
  const rolou = useRolou();
  const itens = ROTAS.filter((r) => r.pronta);

  return (
    <>
      <header className="dl-chrome dl-chrome-top sticky top-0 z-20" data-rolou={rolou ? "sim" : "nao"}>
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
              className="dl-btn dl-btn-ghost !min-h-9 !px-3 hidden md:inline-flex"
              onClick={alternarTema}
              aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}
            >
              {tema === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
              {tema === "dark" ? "Claro" : "Escuro"}
            </button>
            {conta && (
              <>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Avatar nome={conta.nome} />
                  <span>{conta.nome}</span>
                </span>
                <form action={sair} className="hidden md:block">
                  <button type="submit" className="dl-btn dl-btn-secondary !min-h-9 !px-3">
                    Sair
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {conta && itens.length > 1 && (
          <nav className="max-w-6xl mx-auto px-4 sm:px-6 pb-2 hidden md:flex gap-1 overflow-x-auto" aria-label="Seções">
            {itens.map((item) => (
              <Link key={item.href} href={item.href} className="dl-nav-link" aria-current={ativo(pathname, item.href) ? "page" : undefined}>
                {item.rotulo}
              </Link>
            ))}
          </nav>
        )}
      </header>
      {conta && <BarraAbas tema={tema} alternarTema={alternarTema} sair={sair} />}
    </>
  );
}
