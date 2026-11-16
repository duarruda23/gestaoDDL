// Formatação do dashboard de campanhas. Valores vêm em reais (a Meta e a Hotmart
// entregam decimais); só o texto muda, nunca o cálculo.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dinheiro = (v: number | null): string => (v === null ? "—" : brl.format(v));
export const quantidade = (v: number): string => inteiro.format(v);
export const razaoTexto = (v: number | null): string => (v === null ? "—" : decimal.format(v));
export const percentual = (v: number | null): string => (v === null ? "—" : `${decimal.format(v)}%`);

export function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}` : "—";
}

// Data e hora de uma sincronização (ISO) no fuso de Recife.
export function dataHora(iso: string | null): string {
  if (!iso) return "sem registro";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Recife",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
