import type { PontoDia } from "@/lib/servidor/campanhas-nucleo";
import { dataCurta, dinheiro } from "@/lib/campanhas-formato";

// Barras de gasto e receita por dia, em SVG puro (sem biblioteca de gráfico).
// Duas séries lado a lado; a leitura exata está na tabela abaixo, para leitor de tela.

export function GraficoDiario({ serie }: { serie: PontoDia[] }) {
  if (!serie.length) return null;
  const max = Math.max(...serie.flatMap((p) => [p.gasto, p.receita]), 1);
  const largura = 720;
  const altura = 180;
  const base = altura - 22;
  const passo = largura / serie.length;
  const barra = Math.max(Math.min(passo / 2 - 1.5, 14), 1.5);
  const altBarra = (v: number) => Math.max((v / max) * (base - 8), v > 0 ? 1 : 0);
  const marcas = serie.filter((_, i) => i === 0 || i === serie.length - 1 || i % Math.ceil(serie.length / 6) === 0);

  return (
    <figure className="dl-panel">
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full h-auto" role="img" aria-label="Gasto e receita por dia">
        <line x1="0" x2={largura} y1={base} y2={base} stroke="var(--line)" />
        {serie.map((p, i) => {
          const x = i * passo + passo / 2;
          return (
            <g key={p.dia}>
              <title>{`${dataCurta(p.dia)}: gasto ${dinheiro(p.gasto)}, receita ${dinheiro(p.receita)}`}</title>
              <rect x={x - barra - 0.5} y={base - altBarra(p.gasto)} width={barra} height={altBarra(p.gasto)} fill="var(--brand)" rx="1.5" />
              <rect x={x + 0.5} y={base - altBarra(p.receita)} width={barra} height={altBarra(p.receita)} fill="var(--success)" rx="1.5" />
            </g>
          );
        })}
        {marcas.map((p) => (
          <text key={p.dia} x={serie.indexOf(p) * passo + passo / 2} y={altura - 6} textAnchor="middle" fontSize="10" fill="var(--ink-subtle)">
            {dataCurta(p.dia)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--brand)" }} aria-hidden="true" /> Gasto (API da Meta)
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--success)" }} aria-hidden="true" /> Receita Hotmart (aprovadas)
        </span>
      </figcaption>
    </figure>
  );
}
