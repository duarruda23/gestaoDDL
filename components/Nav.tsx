"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { ChartColumn, Ellipsis, House, Inbox, LayoutGrid, LogOut, MessageCircle, Moon, Plus, Sun, Users } from "lucide-react";
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

function FolhaMais({ aberta, onFechar, tema, alternarTema }: { aberta: boolean; onFechar: () => void; tema: "dark" | "light"; alternarTema: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { sair, tarefas } = useGestao();
  const reduzir = useReducedMotion();
  const [velocidadeSaida, setVelocidadeSaida] = useState(0);
  const primeiroLink = useRef<HTMLAnchorElement>(null);
  const naTriagem = tarefas.filter((t) => t.estado === "triagem").length;

  useEffect(() => {
    if (!aberta) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVelocidadeSaida(0);
    primeiroLink.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberta, onFechar]);

  function aoSoltar(_: unknown, info: PanInfo) {
    // Decide pelo destino projetado, não pela posição de soltura: um peteleco curto fecha.
    const destino = info.offset.y + projetar(info.velocity.y);
    if (destino > 140) {
      setVelocidadeSaida(info.velocity.y); // a saída continua na velocidade do dedo
      onFechar();
    }
  }

  const itens = [
    { href: "/triagem", rotulo: "Triagem", icone: Inbox, extra: naTriagem ? `${naTriagem} pedido(s)` : null },
    { href: "/cobrancas", rotulo: "Cobranças", icone: MessageCircle, extra: null },
    { href: "/equipe", rotulo: "Equipe e acessos", icone: Users, extra: null },
  ];

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
            <nav aria-label="Mais seções" className="flex flex-col">
              {itens.map((item, i) => {
                const Icone = item.icone;
                return (
                  <Link
                    key={item.href}
                    ref={i === 0 ? primeiroLink : undefined}
                    href={item.href}
                    onClick={onFechar}
                    aria-current={ativo(pathname, item.href) ? "page" : undefined}
                    className="flex items-center gap-3 rounded-[var(--radius-xl)] px-3 py-3.5 text-[15px] font-semibold text-ink hover:bg-surface-section active:bg-surface-section aria-[current=page]:text-brand-text"
                  >
                    <Icone className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                    <span className="flex-1">{item.rotulo}</span>
                    {item.extra && <span className="text-xs font-semibold text-warning">{item.extra}</span>}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-2 flex flex-col border-t border-line pt-2">
              <button
                type="button"
                onClick={alternarTema}
                className="flex items-center gap-3 rounded-[var(--radius-xl)] px-3 py-3.5 text-left text-[15px] font-semibold text-ink hover:bg-surface-section"
              >
                {tema === "dark" ? <Sun className="h-5 w-5 text-ink-muted" aria-hidden="true" /> : <Moon className="h-5 w-5 text-ink-muted" aria-hidden="true" />}
                {tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onFechar();
                  sair();
                  router.push("/entrar");
                }}
                className="flex items-center gap-3 rounded-[var(--radius-xl)] px-3 py-3.5 text-left text-[15px] font-semibold text-ink hover:bg-surface-section"
              >
                <LogOut className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                Trocar de conta
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function BarraAbas({ tema, alternarTema }: { tema: "dark" | "light"; alternarTema: () => void }) {
  const pathname = usePathname();
  const [maisAberta, setMaisAberta] = useState(false);
  const fecharMais = useCallback(() => setMaisAberta(false), []);
  const noMais = ["/triagem", "/cobrancas", "/equipe"].some((h) => pathname.startsWith(h));
  const abas = [
    { href: "/", rotulo: "Início", icone: House },
    { href: "/quadro", rotulo: "Quadro", icone: LayoutGrid },
  ];

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
        <Link href="/nova" className="dl-tab dl-tab-pedir" aria-current={ativo(pathname, "/nova") ? "page" : undefined}>
          <span className="dl-tab-bolha">
            <Plus aria-hidden="true" />
          </span>
          <span>Pedir</span>
        </Link>
        <Link href="/painel" className="dl-tab" aria-current={ativo(pathname, "/painel") ? "page" : undefined}>
          <ChartColumn aria-hidden="true" />
          <span>Painel</span>
        </Link>
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
      <FolhaMais aberta={maisAberta} onFechar={fecharMais} tema={tema} alternarTema={alternarTema} />
    </>
  );
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { usuarioAtual, sair, tarefas } = useGestao();
  const [tema, alternarTema] = useTema();
  const rolou = useRolou();
  const naTriagem = tarefas.filter((t) => t.estado === "triagem").length;

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
            {usuarioAtual && (
              <>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Avatar nome={usuarioAtual.nome} />
                  <span>{usuarioAtual.nome}</span>
                </span>
                <button
                  type="button"
                  className="dl-btn dl-btn-secondary !min-h-9 !px-3 hidden md:inline-flex"
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
          <nav className="max-w-6xl mx-auto px-4 sm:px-6 pb-2 hidden md:flex gap-1 overflow-x-auto" aria-label="Seções">
            {ITENS.map((item) => (
              <Link key={item.href} href={item.href} className="dl-nav-link" aria-current={ativo(pathname, item.href) ? "page" : undefined}>
                {item.rotulo}
                {item.href === "/triagem" && naTriagem > 0 && (
                  <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 text-xs text-ink">{naTriagem}</span>
                )}
              </Link>
            ))}
          </nav>
        )}
      </header>
      {usuarioAtual && <BarraAbas tema={tema} alternarTema={alternarTema} />}
    </>
  );
}
