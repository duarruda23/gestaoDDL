"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reagendarAbertasSerieAcao } from "@/app/series/acoes";
import { Botao, Campo } from "@/components/ui";

export function ReagendarAbertas({ serieId, versao, abertas, hoje }: {
  serieId: string; versao: number; abertas: number; hoje: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [prazo, setPrazo] = useState("");
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const amanha = new Date(Date.parse(`${hoje}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null); setSucesso(null);
    if (!confirmado) { setErro("Confirme o novo prazo para as tarefas abertas."); return; }
    iniciar(async () => {
      try {
        const r = await reagendarAbertasSerieAcao(serieId, versao, prazo, hora || null, motivo);
        if (!r.ok) { setErro(r.motivo); return; }
        setSucesso(`${r.alteradas} tarefa(s) aberta(s) reagendada(s). As mensagens antigas pendentes foram canceladas.`);
        setConfirmado(false);
        router.refresh();
      } catch { setErro("Não foi possível reagendar. Confira a conexão e tente de novo."); }
    });
  }

  return <form onSubmit={salvar} className="dl-panel mt-6 !p-5 flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Reagendar tarefas abertas</h2>
    <p className="text-sm text-ink-muted">As {abertas} tarefas abertas receberão o mesmo novo prazo. Tarefas concluídas e datas originais das ocorrências permanecem no histórico. Mensagens antigas ainda na fila serão canceladas.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="novo-prazo-abertas" rotulo="Novo prazo"><input id="novo-prazo-abertas" className="dl-input" type="date" min={amanha} required disabled={pendente} value={prazo} onChange={(e) => { setPrazo(e.target.value); setConfirmado(false); }} /></Campo>
      <Campo id="nova-hora-abertas" rotulo="Hora" ajuda="Opcional; sem hora, vence ao fim do dia."><input id="nova-hora-abertas" className="dl-input" type="time" disabled={pendente} value={hora} onChange={(e) => { setHora(e.target.value); setConfirmado(false); }} /></Campo>
    </div>
    <Campo id="motivo-reagendamento" rotulo="Motivo"><textarea id="motivo-reagendamento" className="dl-input" maxLength={500} required disabled={pendente} value={motivo} onChange={(e) => { setMotivo(e.target.value); setConfirmado(false); }} /></Campo>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" required disabled={pendente} checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} /><span>Confirmo o novo prazo para as {abertas} tarefas abertas desta série.</span></label>
    <Botao type="submit" disabled={pendente || !confirmado}>{pendente ? "Reagendando..." : "Reagendar tarefas abertas"}</Botao>
    {erro && <p role="alert" className="text-sm font-semibold text-danger">{erro}</p>}
    {sucesso && <p role="status" className="text-sm text-success">{sucesso}</p>}
  </form>;
}
