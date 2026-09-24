"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Avisos curtos de conclusão, com "Desfazer" quando a ação tem volta.
// Princípio (apple-design, Agency): para um deslize, desfazer é melhor que
// pedir confirmação antes. Confirmação fica só para o que não tem volta.
// Entram e saem pelo mesmo caminho (de baixo), com mola sem quique.

interface Aviso {
  id: number;
  texto: string;
  desfazer?: () => void;
}

interface CtxAvisos {
  avisar: (texto: string, desfazer?: () => void) => void;
}

const Ctx = createContext<CtxAvisos | null>(null);
const DURACAO_MS = 6000;

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximoId = useRef(1);
  const reduzir = useReducedMotion();

  const fechar = useCallback((id: number) => setAvisos((xs) => xs.filter((a) => a.id !== id)), []);

  const avisar = useCallback((texto: string, desfazer?: () => void) => {
    const id = proximoId.current++;
    // Um aviso por vez: o novo substitui o anterior, como no iOS.
    setAvisos([{ id, texto, desfazer }]);
  }, []);

  return (
    <Ctx.Provider value={{ avisar }}>
      {children}
      <div className="dl-toasts" aria-live="polite">
        <AnimatePresence initial={false}>
          {avisos.map((a) => (
            <ItemAviso key={a.id} aviso={a} fechar={fechar} reduzir={Boolean(reduzir)} />
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

function ItemAviso({ aviso, fechar, reduzir }: { aviso: Aviso; fechar: (id: number) => void; reduzir: boolean }) {
  // Timer estável: só reinicia se o aviso mudar, não a cada renderização.
  useEffect(() => {
    const t = setTimeout(() => fechar(aviso.id), DURACAO_MS);
    return () => clearTimeout(t);
  }, [aviso.id, fechar]);
  const onFechar = () => fechar(aviso.id);

  return (
    <motion.div
      className="dl-toast"
      role="status"
      initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
      transition={reduzir ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
    >
      <span>{aviso.texto}</span>
      {aviso.desfazer && (
        <button
          type="button"
          onClick={() => {
            aviso.desfazer?.();
            onFechar();
          }}
        >
          Desfazer
        </button>
      )}
    </motion.div>
  );
}

export function useAvisos(): CtxAvisos {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAvisos precisa estar dentro de AvisosProvider");
  return ctx;
}
