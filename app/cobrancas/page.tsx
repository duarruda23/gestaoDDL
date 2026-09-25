import Link from "next/link";
import { obterBanco } from "@/db";
import { exigirConta } from "@/lib/servidor/dal";
import { listarMensagens, type MensagemVisao } from "@/lib/servidor/cobranca-nucleo";
import { ROTULO_REGRA } from "@/lib/regras";
import { formatarDataHora } from "@/lib/datas";
import type { RegraCobranca } from "@/lib/types";
import { PausarCobrancas } from "@/components/PausarCobrancas";
import { EtiquetaEstado, TituloPagina, Vazio } from "@/components/ui";

export const metadata = { title: "Cobranças · Gestão Donas de Loja" };

type Status = "pendente" | "enviando" | "enviado" | "falhou" | "ignorado";

const ROTULO_STATUS: Record<Status, string> = {
  pendente: "Na fila",
  enviando: "Enviando",
  enviado: "Enviada",
  falhou: "Falhou",
  ignorado: "Não enviada",
};

const ESTADO_VISUAL: Record<Status, "concluida" | "triagem" | "bloqueada" | "arquivada" | "em_andamento"> = {
  enviado: "concluida",
  enviando: "em_andamento",
  pendente: "triagem",
  falhou: "bloqueada",
  ignorado: "arquivada",
};

// *texto* vira negrito, como no WhatsApp.
function negritoWhats(texto: string) {
  return texto.split("*").map((parte, i) => (i % 2 ? <b key={i}>{parte}</b> : parte));
}

function Balao({ m }: { m: MensagemVisao }) {
  const status = m.status as Status;
  const titulo = m.regra === "cobranca_manual" ? `${m.autor?.nome ?? "?"} cobrou` : ROTULO_REGRA[m.regra as RegraCobranca] ?? m.regra;
  return (
    <div className={`dl-panel dl-msg-${status}`}>
      <div className="dl-msg-head">
        <span>
          <strong>{titulo}</strong> → {m.destinatario.nome} · {formatarDataHora(m.criadoEm)}
        </span>
        <EtiquetaEstado estado={ESTADO_VISUAL[status] ?? "triagem"}>{ROTULO_STATUS[status] ?? m.status}</EtiquetaEstado>
      </div>
      <div className="dl-msg-bubble max-w-md">{negritoWhats(m.texto)}</div>
      {m.motivo && <p className="dl-msg-note">{m.motivo}</p>}
      {m.tarefa && (
        <Link href={`/tarefa/${m.tarefa.id}`} className="dl-link mt-2 inline-block text-xs">
          Ver tarefa
        </Link>
      )}
    </div>
  );
}

const ESCOPOS = { todas: "Toda a equipe", comigo: "Para mim", minhas: "Que eu fiz" } as const;
type Escopo = keyof typeof ESCOPOS;

// Fila de mensagens do WhatsApp. Modelo horizontal: todos veem todas as
// cobranças, de quem para quem. O envio de verdade é do n8n (bloco C);
// até lá, as mensagens ficam "Na fila".
export default async function Cobrancas({ searchParams }: PageProps<"/cobrancas">) {
  const conta = await exigirConta();
  const sp = await searchParams;
  const escopo: Escopo = sp.de === "comigo" || sp.de === "minhas" ? sp.de : "todas";
  const status = typeof sp.status === "string" && sp.status in ROTULO_STATUS ? (sp.status as Status) : "";

  const todas = await listarMensagens(obterBanco());
  const doEscopo = todas.filter(
    (m) => escopo === "todas" || (escopo === "comigo" ? m.destinatario.id === conta.id : m.autor?.id === conta.id)
  );
  const lista = doEscopo.filter((m) => !status || m.status === status);
  const link = (de: Escopo, st: Status | "") => {
    const q = new URLSearchParams();
    if (de !== "todas") q.set("de", de);
    if (st) q.set("status", st);
    const s = q.toString();
    return s ? `/cobrancas?${s}` : "/cobrancas";
  };

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        chapeu="Cobranças"
        titulo="Mensagens no WhatsApp"
        subtitulo="Cobranças feitas por colegas e avisos automáticos, todos no mesmo lugar."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="dl-seg" role="group" aria-label="De quem">
              {(Object.keys(ESCOPOS) as Escopo[]).map((e) => (
                <Link key={e} href={link(e, status)} className="dl-seg-opt" aria-pressed={escopo === e}>
                  {ESCOPOS[e]}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["", "pendente", "enviado", "falhou", "ignorado"] as const).map((s) => (
                <Link key={s || "todas"} href={link(escopo, s)} className="dl-nav-link" aria-current={status === s ? "page" : undefined}>
                  {s ? ROTULO_STATUS[s] : "Todas"} ({s ? doEscopo.filter((m) => m.status === s).length : doEscopo.length})
                </Link>
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
          <PausarCobrancas pausada={conta.cobrancaPausada} semWhatsapp={!conta.telefoneWhatsapp.trim()} />
          <div className="dl-panel text-sm">
            <p className="dl-eyebrow mb-2">Como funciona</p>
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-ink-muted">
              <li>Qualquer pessoa cobra qualquer tarefa de outra, pelo botão “Cobrar” na tarefa.</li>
              <li>Uma cobrança por tarefa, por pessoa, por dia.</li>
              <li>Quem pausou ou não cadastrou WhatsApp não recebe; a cobrança fica registrada na tarefa.</li>
              <li>O envio pelo WhatsApp está sendo ligado; por enquanto as mensagens ficam “Na fila”.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
