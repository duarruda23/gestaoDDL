"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarSerieAcao, editarSerieAcao, mudarEstadoSerieAcao } from "@/app/series/acoes";
import { datasProgramadas, validarRegra, type RegraRecorrencia } from "@/lib/recorrencia/calendario";
import type { DadosSerie } from "@/lib/servidor/series-nucleo";
import { Botao, Campo } from "@/components/ui";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
type Opcao = { id: string; nome: string };
type SerieInicial = DadosSerie & { id: string; versao: number; estado: "ativa" | "pausada" | "encerrada" };

export function FormSerie({
  pessoas, frentes, hoje, inicial,
}: { pessoas: Opcao[]; frentes: Opcao[]; hoje: string; inicial?: SerieInicial }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [frenteId, setFrenteId] = useState(inicial?.frenteId ?? "");
  const [responsavelId, setResponsavelId] = useState(inicial?.responsavelId ?? "");
  const [prioridade, setPrioridade] = useState<DadosSerie["prioridade"]>(inicial?.prioridade ?? "media");
  const [frequencia, setFrequencia] = useState<RegraRecorrencia["frequencia"]>(inicial?.regra.frequencia ?? "semanal");
  const [intervalo, setIntervalo] = useState(inicial?.regra.intervalo ?? 1);
  const [diasSemana, setDiasSemana] = useState<number[]>(
    inicial?.regra.frequencia === "semanal" || inicial?.regra.frequencia === "personalizada" ? inicial.regra.diasSemana : []
  );
  const [diaMes, setDiaMes] = useState(inicial?.regra.frequencia === "mensal" ? inicial.regra.diaMes ?? 1 : 1);
  const [ultimoDiaMes, setUltimoDiaMes] = useState(inicial?.regra.frequencia === "mensal" ? Boolean(inicial.regra.ultimoDiaMes) : false);
  const [mesAno, setMesAno] = useState(inicial?.regra.frequencia === "anual" ? inicial.regra.mesAno : 1);
  const [diaAno, setDiaAno] = useState(inicial?.regra.frequencia === "anual" ? inicial.regra.diaAno : 1);
  const [inicioEm, setInicioEm] = useState(inicial?.regra.inicioEm ?? hoje);
  const [fimEm, setFimEm] = useState(inicial?.regra.fimEm ?? "");
  const [hora, setHora] = useState(inicial?.horaVencimento ?? "");
  const [aplicarAbertas, setAplicarAbertas] = useState(false);
  const [versao, setVersao] = useState(inicial?.versao ?? 1);
  const [motivo, setMotivo] = useState("");
  const [confirmacao, setConfirmacao] = useState<"pausar" | "encerrar" | null>(null);
  const [confirmouResumo, setConfirmouResumo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const regra: RegraRecorrencia = useMemo(() => {
    const base = { inicioEm, fimEm: fimEm || null, intervalo: Number(intervalo) };
    return frequencia === "diaria" ? { ...base, frequencia }
      : frequencia === "semanal" || frequencia === "personalizada" ? { ...base, frequencia, diasSemana }
        : frequencia === "mensal" ? { ...base, frequencia, ...(ultimoDiaMes ? { ultimoDiaMes: true } : { diaMes: Number(diaMes) }) }
          : { ...base, frequencia: "anual", mesAno: Number(mesAno), diaAno: Number(diaAno) };
  }, [frequencia, intervalo, inicioEm, fimEm, diasSemana, diaMes, ultimoDiaMes, mesAno, diaAno]);
  const { preview, erroRegra } = useMemo(() => {
    try {
      validarRegra(regra);
      const ate = new Date(`${hoje}T00:00:00Z`);
      ate.setUTCFullYear(ate.getUTCFullYear() + 6);
      return { preview: datasProgramadas(regra, hoje, ate.toISOString().slice(0, 10)).slice(0, 5), erroRegra: null };
    } catch (e) {
      return { preview: [] as string[], erroRegra: e instanceof Error ? e.message : "Regra inválida." };
    }
  }, [regra, hoje]);

  const dados: DadosSerie = { titulo, descricao, frenteId, responsavelId, prioridade, horaVencimento: hora || null, regra };
  const diasLegiveis = [...diasSemana].sort((a, b) => a - b).map((d) => DIAS[d - 1]).join(" e ");
  const resumo = frequencia === "diaria" ? `A cada ${intervalo} dia(s)`
    : frequencia === "semanal" || frequencia === "personalizada" ? `A cada ${intervalo} semana(s), ${diasLegiveis || "sem dia escolhido"}`
      : frequencia === "mensal" ? `A cada ${intervalo} mês(es), ${ultimoDiaMes ? "no último dia" : `no dia ${diaMes}`}`
        : `A cada ${intervalo} ano(s), em ${diaAno}/${mesAno}`;
  const encerrada = inicial?.estado === "encerrada";
  const desabilitado = pendente || encerrada;

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null); setSucesso(null);
    if (erroRegra || !preview.length) { setErro(erroRegra ?? "Não há próxima data dentro do período da série."); return; }
    if (!inicial && !confirmouResumo) { setErro("Confirme a regra e as próximas datas antes de criar."); return; }
    iniciar(async () => {
      try {
        if (!inicial) {
          const r = await criarSerieAcao(dados);
          if (!r.ok) { setErro(r.motivo); return; }
          router.push(`/series/${r.id}`);
        } else {
          const r = await editarSerieAcao(inicial.id, versao, dados, aplicarAbertas);
          if (!r.ok) { setErro(r.motivo); return; }
          setVersao(r.versao);
          setSucesso("Série salva. As tarefas existentes mantêm data e histórico.");
          router.refresh();
        }
      } catch { setErro("Não foi possível salvar. Confira a conexão e tente de novo."); }
    });
  }

  function mudar(acao: "pausar" | "retomar" | "encerrar") {
    if (!inicial) return;
    setErro(null); setSucesso(null);
    iniciar(async () => {
      try {
        const r = await mudarEstadoSerieAcao(inicial.id, versao, acao, motivo);
        if (!r.ok) { setErro(r.motivo); return; }
        setVersao((v) => v + 1);
        setMotivo("");
        router.refresh();
      } catch { setErro("Não foi possível alterar a série. Tente de novo."); }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={salvar} className="dl-panel !p-5 sm:!p-6 flex flex-col gap-4">
        <Campo id="serie-titulo" rotulo="Título"><input id="serie-titulo" className="dl-input" maxLength={200} required disabled={desabilitado} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></Campo>
        <Campo id="serie-desc" rotulo="Contexto" ajuda="Copiado para cada nova tarefa."><textarea id="serie-desc" className="dl-input" maxLength={5000} disabled={desabilitado} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="serie-frente" rotulo="Frente"><select id="serie-frente" className="dl-input" required disabled={desabilitado} value={frenteId} onChange={(e) => setFrenteId(e.target.value)}><option value="">Escolha uma frente</option>{frentes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></Campo>
          <Campo id="serie-resp" rotulo="Responsável"><select id="serie-resp" className="dl-input" required disabled={desabilitado} value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}><option value="">Escolha uma pessoa</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>
          <Campo id="serie-prio" rotulo="Prioridade"><select id="serie-prio" className="dl-input" disabled={desabilitado} value={prioridade} onChange={(e) => setPrioridade(e.target.value as DadosSerie["prioridade"])}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></Campo>
          <Campo id="serie-freq" rotulo="Frequência"><select id="serie-freq" className="dl-input" disabled={desabilitado} value={frequencia} onChange={(e) => setFrequencia(e.target.value as RegraRecorrencia["frequencia"])}><option value="diaria">Diária</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option><option value="anual">Anual</option><option value="personalizada">Personalizada</option></select></Campo>
          <Campo id="serie-intervalo" rotulo={frequencia === "diaria" ? "A cada N dias" : frequencia === "mensal" ? "A cada N meses" : frequencia === "anual" ? "A cada N anos" : "A cada N semanas"}><input id="serie-intervalo" className="dl-input" type="number" min={1} max={365} required disabled={desabilitado} value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))} /></Campo>
        </div>
        {(frequencia === "semanal" || frequencia === "personalizada") && (
          <fieldset disabled={desabilitado}><legend className="mb-2 text-sm font-semibold">Dias da semana</legend><div className="flex flex-wrap gap-2">{DIAS.map((nome, i) => <label key={nome} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={diasSemana.includes(i + 1)} onChange={(e) => setDiasSemana((atual) => e.target.checked ? [...atual, i + 1].sort() : atual.filter((d) => d !== i + 1))} />{nome}</label>)}</div></fieldset>
        )}
        {frequencia === "mensal" && <div className="flex flex-wrap items-end gap-4"><Campo id="serie-dia-mes" rotulo="Dia do mês"><input id="serie-dia-mes" className="dl-input w-24" type="number" min={1} max={31} disabled={desabilitado || ultimoDiaMes} value={diaMes} onChange={(e) => setDiaMes(Number(e.target.value))} /></Campo><label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" checked={ultimoDiaMes} disabled={desabilitado} onChange={(e) => setUltimoDiaMes(e.target.checked)} />Sempre no último dia</label></div>}
        {frequencia === "anual" && <div className="grid gap-4 sm:grid-cols-2"><Campo id="serie-mes" rotulo="Mês"><input id="serie-mes" className="dl-input" type="number" min={1} max={12} disabled={desabilitado} value={mesAno} onChange={(e) => setMesAno(Number(e.target.value))} /></Campo><Campo id="serie-dia-ano" rotulo="Dia"><input id="serie-dia-ano" className="dl-input" type="number" min={1} max={31} disabled={desabilitado} value={diaAno} onChange={(e) => setDiaAno(Number(e.target.value))} /></Campo></div>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="serie-inicio" rotulo="Início"><input id="serie-inicio" className="dl-input" type="date" required disabled={desabilitado} value={inicioEm} onChange={(e) => setInicioEm(e.target.value)} /></Campo>
          <Campo id="serie-fim" rotulo="Fim" ajuda="Opcional e inclusivo."><input id="serie-fim" className="dl-input" type="date" disabled={desabilitado} value={fimEm} onChange={(e) => setFimEm(e.target.value)} /></Campo>
          <Campo id="serie-hora" rotulo="Hora de vencimento" ajuda="Sem hora, vence no fim do dia."><input id="serie-hora" className="dl-input" type="time" disabled={desabilitado} value={hora} onChange={(e) => setHora(e.target.value)} /></Campo>
        </div>
        <div className="rounded-xl bg-surface-subtle p-4 text-sm" role="status">
          <p className="font-semibold">Próximas datas em Recife</p>
          <p>{resumo}, a partir de {inicioEm.split("-").reverse().join("/")}{fimEm ? `, até ${fimEm.split("-").reverse().join("/")}` : ", sem data final"}{hora ? `, às ${hora}` : ", até o fim do dia"}.</p>
          {erroRegra ? <p className="text-danger">{erroRegra}</p> : <p>{preview.length ? preview.map((d) => d.split("-").reverse().join("/")).join(" · ") : "Nenhuma dentro do período."}</p>}
          <p className="mt-2 text-ink-muted">Cada tarefa só será criada no dia programado. Datas futuras não entram na fila de cobrança.</p>
          {frequencia === "mensal" && !ultimoDiaMes && diaMes === 31 && <p className="mt-1 text-ink-muted">Quando não houver dia 31, será usado o último dia válido do mês.</p>}
          {frequencia === "anual" && mesAno === 2 && diaAno === 29 && <p className="mt-1 text-ink-muted">Em ano comum, a data será 28/02.</p>}
        </div>
        {inicial && responsavelId !== inicial.responsavelId && (
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={aplicarAbertas} disabled={desabilitado} onChange={(e) => setAplicarAbertas(e.target.checked)} /><span>Alterar também o responsável das tarefas abertas desta série. O histórico de cada tarefa será registrado. Datas e tarefas concluídas ficam como estão.</span></label>
        )}
        {!inicial && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmouResumo} onChange={(e) => setConfirmouResumo(e.target.checked)} /><span>Conferi a regra e entendo que as tarefas só serão criadas nas datas programadas.</span></label>}
        {inicial && <p className="text-sm text-ink-muted">Salvar a série altera só as próximas ocorrências. Para editar uma tarefa já criada, abra a ocorrência abaixo.</p>}
        {!encerrada && <Botao type="submit" variant="primary" disabled={pendente || (!inicial && !confirmouResumo)}>{pendente ? "Salvando..." : inicial ? "Salvar série" : "Criar série"}</Botao>}
        {erro && <p role="alert" className="text-sm font-semibold text-danger">{erro}</p>}
        {sucesso && <p role="status" className="text-sm text-success">{sucesso}</p>}
      </form>
      {inicial && !encerrada && (
        <section className="dl-panel !p-5 flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Estado da série</h2>
          <p className="text-sm text-ink-muted">Pausar ou encerrar impede novas tarefas. As tarefas já criadas continuam no quadro e podem ser cobradas quando vencerem.</p>
          <Campo id="serie-motivo" rotulo="Motivo da pausa ou encerramento"><textarea id="serie-motivo" className="dl-input" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
          <div className="flex flex-wrap gap-2">
            {inicial.estado === "ativa" && <Botao disabled={pendente || !motivo.trim()} onClick={() => setConfirmacao("pausar")}>Pausar</Botao>}
            {inicial.estado === "pausada" && <Botao disabled={pendente} onClick={() => mudar("retomar")}>Retomar</Botao>}
            <Botao disabled={pendente || !motivo.trim()} onClick={() => setConfirmacao("encerrar")}>Encerrar definitivamente</Botao>
          </div>
          {confirmacao && <div className="rounded-xl border p-4 text-sm" role="group" aria-label="Confirmar mudança da série">
            <p className="mb-3">Confirma {confirmacao === "pausar" ? "pausar" : "encerrar"} esta série? As tarefas já criadas continuam no quadro.</p>
            <div className="flex gap-2">
              <Botao variant="danger" disabled={pendente} onClick={() => { mudar(confirmacao); setConfirmacao(null); }}>Confirmar</Botao>
              <Botao disabled={pendente} onClick={() => setConfirmacao(null)}>Cancelar</Botao>
            </div>
          </div>}
        </section>
      )}
    </div>
  );
}
