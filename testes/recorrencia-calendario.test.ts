import { describe, expect, it } from "vitest";
import { chaveOcorrencia, dataHoraRecife, datasAteHoje, datasProgramadas, inicioSemana, validarRegra, vencimentoAtingido } from "@/lib/recorrencia/calendario";

describe("calendário de recorrência em Recife", () => {
  it("não antecipa nem retroage semanal", () => {
    const regra = { frequencia: "semanal" as const, intervalo: 1, inicioEm: "2026-10-06", diasSemana: [2] };
    expect(datasAteHoje(regra, "2026-10-06", new Date("2026-10-06T12:00:00Z"))).toEqual(["2026-10-06"]);
    expect(datasProgramadas(regra, "2026-10-07", "2026-10-20")).toEqual(["2026-10-13", "2026-10-20"]);
  });

  it("gera terça e quinta separadas, a partir da quarta", () => {
    const regra = { frequencia: "personalizada" as const, intervalo: 1, inicioEm: "2026-10-07", diasSemana: [2, 4] };
    expect(datasProgramadas(regra, "2026-10-07", "2026-10-15")).toEqual(["2026-10-08", "2026-10-13", "2026-10-15"]);
    expect(datasAteHoje(regra, "2026-10-07", new Date("2026-10-08T02:59:59Z"))).toEqual([]);
    expect(datasAteHoje(regra, "2026-10-07", new Date("2026-10-08T03:00:00Z"))).toEqual(["2026-10-08"]);
  });

  it("ancora intervalo semanal na segunda da semana inicial", () => {
    const regra = { frequencia: "personalizada" as const, intervalo: 2, inicioEm: "2026-10-07", diasSemana: [2, 4] };
    expect(datasProgramadas(regra, "2026-10-07", "2026-10-30")).toEqual(["2026-10-08", "2026-10-20", "2026-10-22"]);
  });

  it("gera diária apenas no dia local e respeita intervalo", () => {
    const regra = { frequencia: "diaria" as const, intervalo: 1, inicioEm: "2026-10-06" };
    expect(datasProgramadas(regra, "2026-10-06", "2026-10-08")).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(datasAteHoje(regra, "2026-10-06", new Date("2026-10-07T02:59:59Z"))).toEqual(["2026-10-06"]);
    expect(datasProgramadas({ ...regra, intervalo: 2 }, "2026-10-06", "2026-10-10")).toEqual(["2026-10-06", "2026-10-08", "2026-10-10"]);
  });

  it("mantém âncora mensal 31, inclusive fevereiro e retorno a maio", () => {
    const regra = { frequencia: "mensal" as const, intervalo: 1, inicioEm: "2027-01-01", diaMes: 31 };
    expect(datasProgramadas(regra, "2027-01-01", "2027-05-31")).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]);
    expect(datasProgramadas({ ...regra, ultimoDiaMes: true, diaMes: undefined }, "2027-01-01", "2027-03-31")).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("mantém âncora anual 29/02 e respeita fim inclusivo", () => {
    const regra = { frequencia: "anual" as const, intervalo: 1, inicioEm: "2027-01-01", mesAno: 2, diaAno: 29 };
    expect(datasProgramadas(regra, "2027-01-01", "2029-12-31")).toEqual(["2027-02-28", "2028-02-29", "2029-02-28"]);
    expect(datasProgramadas({ ...regra, fimEm: "2028-02-29" }, "2027-01-01", "2029-12-31")).toEqual(["2027-02-28", "2028-02-29"]);
  });

  it("vira semana e mês no limite UTC correspondente", () => {
    expect(inicioSemana("2027-01-31")).toBe("2027-01-25");
    expect(inicioSemana("2027-02-01")).toBe("2027-02-01");
    expect(dataHoraRecife(new Date("2027-02-01T02:59:59Z"))).toEqual({ data: "2027-01-31", hora: "23:59:59" });
    expect(dataHoraRecife(new Date("2027-02-01T03:00:00Z"))).toEqual({ data: "2027-02-01", hora: "00:00:00" });
  });

  it("só permite cobrança após o vencimento, inclusive hora exata", () => {
    expect(vencimentoAtingido("2026-10-06", "09:00", new Date("2026-10-06T11:59:59Z"))).toBe(false);
    expect(vencimentoAtingido("2026-10-06", "09:00", new Date("2026-10-06T12:00:00Z"))).toBe(true);
    expect(vencimentoAtingido("2026-10-06", null, new Date("2026-10-07T02:59:59Z"))).toBe(false);
    expect(vencimentoAtingido("2026-10-06", null, new Date("2026-10-07T03:00:00Z"))).toBe(true);
    expect(vencimentoAtingido("2026-10-13", "09:00", new Date("2026-10-06T12:00:00Z"))).toBe(false);
  });

  it("retomada não faz backfill e chave é estável entre execuções", () => {
    const regra = { frequencia: "semanal" as const, intervalo: 1, inicioEm: "2026-10-06", diasSemana: [2] };
    expect(datasProgramadas(regra, "2026-10-21", "2026-11-03")).toEqual(["2026-10-27", "2026-11-03"]);
    expect(chaveOcorrencia("2026-10-27")).toBe(chaveOcorrencia("2026-10-27"));
  });

  it("recusa regras e datas inválidas", () => {
    const base = { frequencia: "diaria" as const, intervalo: 1, inicioEm: "2026-10-06" };
    expect(() => validarRegra({ ...base, intervalo: 0 })).toThrow();
    expect(() => validarRegra({ ...base, fimEm: "2026-10-05" })).toThrow();
    expect(() => validarRegra({ ...base, inicioEm: "2026-02-30" })).toThrow();
    expect(() => validarRegra({ frequencia: "semanal", intervalo: 1, inicioEm: base.inicioEm, diasSemana: [2, 2] })).toThrow();
    expect(() => validarRegra({ frequencia: "anual", intervalo: 1, inicioEm: base.inicioEm, mesAno: 4, diaAno: 31 })).toThrow();
  });
});
