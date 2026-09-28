// Datas sempre no fuso America/Sao_Paulo (regra da seção 6 do spec).

export const FUSO = "America/Sao_Paulo";

export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d + dias));
  return data.toISOString().slice(0, 10);
}

export function diferencaDias(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round(
    (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000
  );
}

const DIAS_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export function diaSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

export function formatarData(iso: string | null): string {
  if (!iso) return "Sem prazo";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Hora do prazo é opcional ("HH:MM"). Sem hora, o prazo vale até o fim do dia.
export const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// "14:00" → "14h"; "09:30" → "9h30".
export function formatarHora(hora: string): string {
  const [h, m] = hora.split(":");
  return `${Number(h)}h${m === "00" ? "" : m}`;
}

// Hora atual em São Paulo, "HH:MM".
export function horaAtual(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(agora);
}

function descreverDia(iso: string, hoje: string): string {
  const dif = diferencaDias(hoje, iso);
  if (dif === 0) return "Hoje";
  if (dif === 1) return "Amanhã";
  if (dif === -1) return "Ontem";
  if (dif < 0) return `${-dif} dias atrás`;
  if (dif < 7) return `${diaSemana(iso).replace("-feira", "")} (${formatarData(iso)})`;
  return formatarData(iso);
}

export function descreverPrazo(iso: string | null, hoje = hojeISO(), hora: string | null = null): string {
  if (!iso) return "Sem prazo";
  const dia = descreverDia(iso, hoje);
  return hora ? `${dia} às ${formatarHora(hora)}` : dia;
}

// Prazo como fica no histórico: "2026-10-02" ou "2026-10-02 14:00".
export function juntarPrazo(iso: string | null, hora: string | null): string | null {
  return iso ? (hora ? `${iso} ${hora}` : iso) : null;
}

export function formatarPrazoHistorico(v: string): string {
  const [iso, hora] = v.split(" ");
  return hora ? `${formatarData(iso)} às ${formatarHora(hora)}` : formatarData(iso);
}

export function agoraISO(): string {
  return new Date().toISOString();
}

export function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
