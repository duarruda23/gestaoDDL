"use client";

import Link from "next/link";
import type { Estado, Prioridade } from "@/lib/types";
import type { TarefaVisao } from "@/lib/visao";
import { ROTULO_ESTADO, ROTULO_PRIORIDADE, estaVencida, venceEmBreve } from "@/lib/regras";
import { descreverPrazo } from "@/lib/datas";

// Componentes do design system "Gestão Donas de Loja" (namespace DonasGestao),
// portados para React/TSX com as mesmas classes dl-* do bundle.css.

function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}

type VarianteBotao = "primary" | "success" | "secondary" | "ghost" | "danger";

export function Botao({
  variant = "secondary",
  size,
  block,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: VarianteBotao; size?: "lg"; block?: boolean }) {
  return (
    <button
      type="button"
      className={cx("dl-btn", `dl-btn-${variant}`, size === "lg" && "dl-btn-lg", block && "dl-btn-block", className)}
      {...rest}
    />
  );
}

export function BotaoLink({
  href,
  variant = "secondary",
  children,
  className,
}: {
  href: string;
  variant?: VarianteBotao;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cx("dl-btn", `dl-btn-${variant}`, className)}>
      {children}
    </Link>
  );
}

export function Segmentado<T extends string>({
  rotulo,
  opcoes,
  valor,
  onChange,
}: {
  rotulo: string;
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="dl-seg" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          className="dl-seg-opt"
          aria-pressed={o.valor === valor}
          onClick={() => onChange(o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function EtiquetaEstado({ estado, children }: { estado: Estado; children?: React.ReactNode }) {
  return <span className={`dl-status dl-status-${estado}`}>{children ?? ROTULO_ESTADO[estado]}</span>;
}

export function EtiquetaPrioridade({ prioridade }: { prioridade: Prioridade }) {
  return <span className={`dl-tag dl-tag-${prioridade}`}>{ROTULO_PRIORIDADE[prioridade]}</span>;
}

export function EtiquetaIA() {
  return (
    <span className="dl-tag dl-tag-ia" title="Pedida em texto livre e interpretada pela IA">
      IA
    </span>
  );
}

export function EtiquetaPrazo({ tarefa }: { tarefa: Pick<TarefaVisao, "estado" | "prazo"> }) {
  const estado = estaVencida(tarefa) ? "late" : venceEmBreve(tarefa) ? "soon" : "ok";
  return (
    <span className={cx("dl-deadline", estado !== "ok" && `dl-deadline-${estado}`)}>
      {estado === "late" ? "Venceu: " : ""}
      {descreverPrazo(tarefa.prazo)}
    </span>
  );
}

export function Avatar({ nome }: { nome: string | null }) {
  if (!nome) {
    return (
      <span className="dl-avatar dl-avatar-empty" title="Sem responsável">
        ?
      </span>
    );
  }
  return (
    <span className="dl-avatar" title={nome}>
      {nome.charAt(0).toUpperCase()}
    </span>
  );
}

export function CartaoTarefa({ tarefa, compacto = false }: { tarefa: TarefaVisao; compacto?: boolean }) {
  const resp = tarefa.responsavel;
  const pediuOutra = tarefa.criador.id !== resp?.id;

  return (
    <Link href={`/tarefa/${tarefa.id}`} className="dl-card">
      <div className="dl-card-top">
        <p className="dl-card-title">{tarefa.titulo}</p>
        {tarefa.origem === "ia" && <EtiquetaIA />}
      </div>
      {tarefa.estado === "bloqueada" && tarefa.motivoBloqueio && !compacto && (
        <p className="dl-card-block">Bloqueio: {tarefa.motivoBloqueio}</p>
      )}
      <div className="dl-card-meta">
        <Avatar nome={resp?.nome ?? null} />
        <span>{resp?.nome ?? "Sem responsável"}</span>
        <span aria-hidden="true">·</span>
        <EtiquetaPrazo tarefa={tarefa} />
        {(tarefa.prioridade === "urgente" || tarefa.prioridade === "alta") && (
          <EtiquetaPrioridade prioridade={tarefa.prioridade} />
        )}
      </div>
      {!compacto && (
        <div className="dl-card-foot">
          <span>{pediuOutra ? `Pedido de ${tarefa.criador.nome}` : tarefa.frente?.nome ?? "Sem frente"}</span>
          {tarefa.checklistTotal > 0 && (
            <span>
              {tarefa.checklistFeitos}/{tarefa.checklistTotal} itens
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <div className="dl-empty">{children}</div>;
}

export function Aviso({
  tom,
  titulo,
  itens,
  children,
}: {
  tom?: "warning" | "danger" | "success";
  titulo?: string;
  itens?: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className={cx("dl-callout", tom && `dl-callout-${tom}`)} role={tom === "danger" ? "alert" : undefined}>
      {titulo && <p className="dl-callout-title">{titulo}</p>}
      {itens ? (
        <ul>
          {itens.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : (
        children
      )}
    </div>
  );
}

export function Contador({
  href,
  valor,
  rotulo,
  tom = "neutral",
}: {
  href?: string;
  valor: number;
  rotulo: string;
  tom?: "danger" | "warning" | "success" | "neutral";
}) {
  const classe = cx("dl-stat", `dl-stat-${valor > 0 ? tom : "zero"}`);
  const conteudo = (
    <>
      <p className="dl-stat-value">{valor}</p>
      <p className="dl-stat-label">{rotulo}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cx(classe, "block hover:border-brand")}>
        {conteudo}
      </Link>
    );
  }
  return <div className={classe}>{conteudo}</div>;
}

export function TituloPagina({
  chapeu,
  titulo,
  subtitulo,
  acao,
}: {
  chapeu?: string;
  titulo: React.ReactNode;
  subtitulo?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <header>
        {chapeu && <p className="dl-eyebrow">{chapeu}</p>}
        <h1 className="dl-heading">{titulo}</h1>
        {subtitulo && <p className="dl-subheading">{subtitulo}</p>}
      </header>
      {acao}
    </div>
  );
}

export function TituloSecao({ children, tom }: { children: React.ReactNode; tom?: "danger" }) {
  return (
    <h2 className={cx("mb-3 text-[20px] leading-[26px] font-extrabold", tom === "danger" ? "text-danger" : "text-ink")}>
      {children}
    </h2>
  );
}

export function Campo({
  id,
  rotulo,
  ajuda,
  estado,
  children,
}: {
  id: string;
  rotulo: string;
  ajuda?: string;
  estado?: "pending" | "error";
  children: React.ReactNode;
}) {
  return (
    <div className={cx("dl-field", estado && `dl-field-${estado}`)}>
      <label className="dl-field-label" htmlFor={id}>
        {rotulo}
      </label>
      {children}
      {ajuda && <span className="dl-field-hint">{ajuda}</span>}
    </div>
  );
}

export function Carregando() {
  return <p className="text-sm text-ink-subtle">Carregando...</p>;
}
