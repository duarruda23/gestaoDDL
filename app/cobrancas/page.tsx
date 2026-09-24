"use client";

import Link from "next/link";
import { useState } from "react";
import { useGestao } from "@/lib/store";
import type { Mensagem, StatusEnvio } from "@/lib/types";
import { ROTULO_REGRA } from "@/lib/regras";
import { formatarDataHora } from "@/lib/datas";
import { DIAS_PARA_AVISAR_QUEM_PEDIU, JANELA_FIM, JANELA_INICIO, dentroDaJanela } from "@/lib/cobrancas";
import { Botao, EtiquetaEstado, Segmentado, TituloPagina, Vazio } from "@/components/ui";

const ROTULO_STATUS: Record<StatusEnvio, string> = {
  pendente: "Aguardando janela",
  enviado: "Enviada",
  falhou: "Falhou",
  ignorado: "Não enviada",
};

const ESTADO_VISUAL: Record<StatusEnvio, "concluida" | "triagem" | "bloqueada" | "arquivada"> = {
  enviado: "concluida",
  pendente: "triagem",
  falhou: "bloqueada",
  ignorado: "arquivada",
};

// *texto* vira negrito, como no WhatsApp.
function negritoWhats(texto: string) {
  return texto.split("*").map((parte, i) => (i % 2 ? <b key={i}>{parte}</b> : parte));
}

function Balao({ m }: { m: Mensagem }) {
  const { usuarios, tarefas, reenviarMensagem } = useGestao();
  const nome = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? "?";
  const titulo = m.regra === "cobranca_manual" ? `${nome(m.autorId)} cobrou` : ROTULO_REGRA[m.regra];
  return (
    <div className={`dl-panel dl-msg-${m.status} !max-w-none`}>
      <div className="dl-msg-head">
        <span>
          <strong>{titulo}</strong> → {nome(m.destinatarioId)} · {formatarDataHora(m.criadoEm)}
        </span>
        <EtiquetaEstado estado={ESTADO_VISUAL[m.status]}>{ROTULO_STATUS[m.status]}</EtiquetaEstado>
      </div>
      {m.texto && <div className="dl-msg-bubble max-w-md">{negritoWhats(m.texto)}</div>}
      {m.motivo && <p className="dl-msg-note">{m.motivo}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-subtle">
        {m.tarefaId && tarefas.some((t) => t.id === m.tarefaId) && (
          <Link href={`/tarefa/${m.tarefaId}`} className="dl-link">
            Ver tarefa
          </Link>
        )}
        <span>Tentativas: {m.tentativas}</span>
        <span className="dl-code">{m.chave}</span>
        {m.status === "falhou" && (
          <Botao variant="secondary" className="!min-h-8 !px-3 !text-xs" onClick={() => reenviarMensagem(m.id)}>
            Tentar de novo
          </Botao>
        )}
      </div>
    </div>
  );
}

export default function Cobrancas() {
  const { usuarioAtual, mensagens, usuarios, rodarCobrancasAgora, alternarPausa } = useGestao();
  const [ignorarJanela, setIgnorarJanela] = useState(false);
  const [retorno, setRetorno] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<StatusEnvio | "">("");
  const [escopo, setEscopo] = useState<"todas" | "minhas">("todas");

  if (!usuarioAtual) return null;
  const eu = usuarioAtual.id;

  function rodar() {
    const r = rodarCobrancasAgora(ignorarJanela);
    setRetorno(
      r.novas.length
        ? `${r.novas.length} mensagem(ns) nova(s) na fila.${r.jaExistiam ? ` ${r.jaExistiam} já tinham sido geradas hoje e não se repetiram.` : ""}`
        : `Nenhuma mensagem nova. ${r.jaExistiam} cobrança(s) de hoje já estavam na fila: rodar de novo não duplica nada.`
    );
  }

  const doEscopo = mensagens.filter((m) => escopo === "todas" || m.destinatarioId === eu || m.autorId === eu);
  const lista = doEscopo.filter((m) => !filtro || m.status === filtro);

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        chapeu="Cobranças"
        titulo="Mensagens no WhatsApp"
        subtitulo="Automáticas e feitas por colegas, todas no mesmo lugar. No sistema real o n8n envia; aqui o envio é simulado."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4 min-w-0">
          <div className="dl-panel flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Botao variant="primary" onClick={rodar}>
                Rodar cobranças automáticas
              </Botao>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={ignorarJanela} onChange={(e) => setIgnorarJanela(e.target.checked)} className="accent-[var(--brand)]" />
                Ignorar janela de envio (só pra demo)
              </label>
            </div>
            <p className="text-xs text-ink-subtle">
              Agora {dentroDaJanela() ? "está" : "não está"} dentro da janela de envio ({JANELA_INICIO}h às {JANELA_FIM}h). Rode duas vezes seguidas para ver que nada se repete.
            </p>
            {retorno && <p className="text-sm font-semibold text-success">{retorno}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Segmentado
              rotulo="De quem"
              valor={escopo}
              onChange={setEscopo}
              opcoes={[
                { valor: "todas", rotulo: "Toda a equipe" },
                { valor: "minhas", rotulo: "Comigo" },
              ]}
            />
            <div className="flex flex-wrap gap-1.5">
              {(["", "enviado", "pendente", "falhou", "ignorado"] as const).map((s) => (
                <button
                  key={s || "todas"}
                  onClick={() => setFiltro(s)}
                  className="dl-nav-link"
                  aria-current={filtro === s ? "page" : undefined}
                >
                  {s ? ROTULO_STATUS[s] : "Todas"} ({s ? doEscopo.filter((m) => m.status === s).length : doEscopo.length})
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {lista.length === 0 && <Vazio>Nenhuma mensagem com esse filtro.</Vazio>}
            {lista.map((m) => (
              <Balao key={m.id} m={m} />
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="dl-panel text-sm">
            <p className="dl-eyebrow mb-2">Regras automáticas</p>
            <ul className="flex flex-col gap-1.5 text-ink-muted">
              <li>Aviso quando alguém recebe uma tarefa, dizendo quem pediu</li>
              <li>Lembrete na véspera do prazo</li>
              <li>Cobrança diária enquanto estiver vencida</li>
              <li>Depois de {DIAS_PARA_AVISAR_QUEM_PEDIU} dias vencida, quem pediu é avisado</li>
              <li>Nada para tarefa concluída, arquivada, na triagem, bloqueada ou sem dono</li>
              <li>Envio só entre {JANELA_INICIO}h e {JANELA_FIM}h</li>
            </ul>
            <p className="dl-eyebrow mt-4 mb-2">Cobrança de colega</p>
            <p className="text-ink-muted">
              Qualquer pessoa cobra qualquer tarefa de outra, o Ítalo incluído, pelo botão verde na tarefa. Uma vez por dia por tarefa.
            </p>
          </div>

          <div className="dl-panel">
            <p className="dl-eyebrow mb-3">Receber no WhatsApp</p>
            <ul className="flex flex-col gap-2">
              {usuarios.filter((u) => u.ativo).map((u) => (
                <li key={u.id} className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{u.nome}</span>
                  {u.id === eu ? (
                    <button onClick={() => alternarPausa(u.id)} className={`dl-status ${u.cobrancaPausada ? "dl-status-arquivada" : "dl-status-concluida"}`}>
                      {u.cobrancaPausada ? "Pausado" : "Ativo"}
                    </button>
                  ) : (
                    <span className={`dl-status ${u.cobrancaPausada ? "dl-status-arquivada" : "dl-status-concluida"}`}>{u.cobrancaPausada ? "Pausado" : "Ativo"}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-subtle">Cada pessoa pausa só as próprias mensagens.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
