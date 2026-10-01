import { FUSO, FORMATO_HORA } from "../datas";

export type RegraRecorrencia =
  | { frequencia: "diaria"; intervalo: number; inicioEm: string; fimEm?: string | null }
  | { frequencia: "semanal" | "personalizada"; intervalo: number; inicioEm: string; fimEm?: string | null; diasSemana: number[] }
  | { frequencia: "mensal"; intervalo: number; inicioEm: string; fimEm?: string | null; diaMes?: number; ultimoDiaMes?: boolean }
  | { frequencia: "anual"; intervalo: number; inicioEm: string; fimEm?: string | null; mesAno: number; diaAno: number };

const DIA_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function diaUtc(iso: string): number {
  if (!ISO.test(iso)) throw new Error("Data local inválida.");
  const [ano, mes, dia] = iso.split("-").map(Number);
  const valor = Date.UTC(ano, mes - 1, dia);
  if (new Date(valor).toISOString().slice(0, 10) !== iso) throw new Error("Data local inválida.");
  return valor / DIA_MS;
}

function isoDia(dia: number): string {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10);
}

export function inicioSemana(iso: string): string {
  const dia = diaUtc(iso);
  const weekday = new Date(dia * DIA_MS).getUTCDay() || 7;
  return isoDia(dia - weekday + 1);
}

export function dataHoraRecife(instante: Date): { data: string; hora: string } {
  if (Number.isNaN(instante.getTime())) throw new Error("Instante inválido.");
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instante);
  const p = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` };
}

export function vencimentoAtingido(data: string, hora: string | null, instante: Date): boolean {
  diaUtc(data);
  if (hora && !FORMATO_HORA.test(hora)) throw new Error("Hora inválida.");
  const agora = dataHoraRecife(instante);
  return agora.data > data || (agora.data === data && hora !== null && agora.hora >= `${hora}:00`);
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function validarRegra(regra: RegraRecorrencia): void {
  diaUtc(regra.inicioEm);
  if (regra.fimEm && diaUtc(regra.fimEm) < diaUtc(regra.inicioEm)) throw new Error("Fim anterior ao início.");
  if (!Number.isSafeInteger(regra.intervalo) || regra.intervalo < 1) throw new Error("Intervalo inválido.");
  if (regra.frequencia === "semanal" || regra.frequencia === "personalizada") {
    const dias = regra.diasSemana;
    if (!dias.length || dias.some((d) => !Number.isInteger(d) || d < 1 || d > 7) || new Set(dias).size !== dias.length)
      throw new Error("Dias da semana inválidos.");
    if (regra.frequencia === "personalizada" && dias.length < 2 && regra.intervalo === 1)
      throw new Error("Personalizada exige vários dias ou intervalo de semanas.");
  }
  if (regra.frequencia === "mensal") {
    if (Boolean(regra.ultimoDiaMes) === Boolean(regra.diaMes) || (regra.diaMes !== undefined && (!Number.isInteger(regra.diaMes) || regra.diaMes < 1 || regra.diaMes > 31)))
      throw new Error("Dia do mês inválido.");
  }
  if (regra.frequencia === "anual") {
    if (!Number.isInteger(regra.mesAno) || regra.mesAno < 1 || regra.mesAno > 12 ||
        !Number.isInteger(regra.diaAno) || regra.diaAno < 1 || regra.diaAno > diasNoMes(2028, regra.mesAno))
      throw new Error("Data anual inválida.");
  }
}

// Datas inclusivas de uma janela. 'desde' pode ser criação/retomada para evitar backfill.
export function datasProgramadas(regra: RegraRecorrencia, desde: string, ate: string): string[] {
  validarRegra(regra);
  const primeiro = Math.max(diaUtc(desde), diaUtc(regra.inicioEm));
  const ultimo = Math.min(diaUtc(ate), regra.fimEm ? diaUtc(regra.fimEm) : Infinity);
  if (ultimo < primeiro) return [];
  if (ultimo - primeiro > 36_600) throw new Error("Janela maior que cem anos.");
  const inicio = diaUtc(regra.inicioEm);
  const semanaAncora = diaUtc(inicioSemana(regra.inicioEm));
  const saida: string[] = [];
  for (let dia = primeiro; dia <= ultimo; dia++) {
    const data = new Date(dia * DIA_MS);
    const ano = data.getUTCFullYear();
    const mes = data.getUTCMonth() + 1;
    const diaMes = data.getUTCDate();
    let ocorre = false;
    switch (regra.frequencia) {
      case "diaria": ocorre = (dia - inicio) % regra.intervalo === 0; break;
      case "semanal":
      case "personalizada": {
        const semana = diaUtc(inicioSemana(isoDia(dia)));
        ocorre = ((semana - semanaAncora) / 7) % regra.intervalo === 0 &&
          regra.diasSemana.includes(data.getUTCDay() || 7);
        break;
      }
      case "mensal": {
        const a = new Date(inicio * DIA_MS);
        const meses = (ano - a.getUTCFullYear()) * 12 + mes - a.getUTCMonth() - 1;
        ocorre = meses % regra.intervalo === 0 &&
          diaMes === (regra.ultimoDiaMes ? diasNoMes(ano, mes) : Math.min(regra.diaMes!, diasNoMes(ano, mes)));
        break;
      }
      case "anual": {
        const anos = ano - new Date(inicio * DIA_MS).getUTCFullYear();
        ocorre = anos % regra.intervalo === 0 && mes === regra.mesAno &&
          diaMes === Math.min(regra.diaAno, diasNoMes(ano, mes));
        break;
      }
    }
    if (ocorre) saida.push(isoDia(dia));
  }
  return saida;
}

export function datasAteHoje(regra: RegraRecorrencia, desde: string, agora: Date): string[] {
  return datasProgramadas(regra, desde, dataHoraRecife(agora).data);
}

export function chaveOcorrencia(data: string): string {
  diaUtc(data);
  return data;
}
