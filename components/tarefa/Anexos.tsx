"use client";

import { useRef, useState, useTransition } from "react";
import type { AnexoVisao } from "@/lib/servidor/anexos-nucleo";
import { adicionarLinkAcao, enviarAnexoAcao, removerAnexoAcao } from "@/app/tarefa/acoes";
import { formatarDataHora } from "@/lib/datas";
import { Botao } from "../ui";

const ACEITOS = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.docx,.xlsx,.pptx";
const MAX = 8 * 1024 * 1024;

function tamanho(bytes: number | null): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Arquivos (até 8 MB) e links. Arquivo grande ou vídeo vai como link do Drive.
export function Anexos({ tarefaId, anexos, arquivada }: { tarefaId: string; anexos: AnexoVisao[]; arquivada: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [nomeLink, setNomeLink] = useState("");
  const [modoLink, setModoLink] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    // Checa antes de subir, pra não gastar a conexão à toa.
    if (arquivo.size > MAX) {
      setErro("Arquivo acima de 8 MB. Envie um link (Drive, por exemplo).");
      return;
    }
    const dados = new FormData();
    dados.set("arquivo", arquivo);
    iniciar(async () => {
      const r = await enviarAnexoAcao(tarefaId, dados);
      if (!r.ok) setErro(r.motivo);
      if (entrada.current) entrada.current.value = "";
    });
  }

  function salvarLink() {
    if (!link.trim()) return;
    setErro(null);
    iniciar(async () => {
      const r = await adicionarLinkAcao(tarefaId, link, nomeLink);
      if (r.ok) {
        setLink("");
        setNomeLink("");
        setModoLink(false);
      } else setErro(r.motivo);
    });
  }

  function remover(a: AnexoVisao) {
    setErro(null);
    iniciar(async () => {
      const r = await removerAnexoAcao(a.id);
      if (!r.ok) setErro(r.motivo);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {anexos.length > 0 && (
        <ul className="dl-panel flex flex-col gap-2 text-sm">
          {anexos.map((a) => (
            <li key={a.id} className="group flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <a
                href={a.url ?? `/api/anexos/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="dl-link min-w-0 max-w-full truncate"
              >
                {a.url ? "🔗 " : "📎 "}
                {a.nome}
              </a>
              <span className="text-xs text-ink-subtle">
                {[tamanho(a.tamanhoBytes), a.autor, formatarDataHora(a.criadoEm)].filter(Boolean).join(" · ")}
              </span>
              {!arquivada && (
                <button
                  type="button"
                  className="ml-auto text-xs font-semibold text-ink-subtle hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                  disabled={pendente}
                  onClick={() => remover(a)}
                  aria-label={`Remover anexo ${a.nome}`}
                >
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!anexos.length && arquivada && <p className="text-sm text-ink-subtle">Sem anexos.</p>}

      {!arquivada && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input ref={entrada} type="file" accept={ACEITOS} className="sr-only" id={`anexo-${tarefaId}`} onChange={(e) => enviar(e.target.files?.[0])} />
            <Botao variant="secondary" disabled={pendente} onClick={() => entrada.current?.click()}>
              {pendente ? "Enviando..." : "Anexar arquivo"}
            </Botao>
            <Botao variant="ghost" disabled={pendente} onClick={() => setModoLink((v) => !v)} aria-expanded={modoLink}>
              Adicionar link
            </Botao>
          </div>
          {modoLink && (
            <div className="dl-surgir flex flex-col gap-2 sm:flex-row">
              <input
                className="dl-input"
                type="url"
                placeholder="https://drive.google.com/..."
                aria-label="Link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                autoFocus
              />
              <input className="dl-input sm:!w-48" placeholder="Nome (opcional)" aria-label="Nome do link" maxLength={150} value={nomeLink} onChange={(e) => setNomeLink(e.target.value)} />
              <Botao variant="secondary" disabled={pendente || !link.trim()} onClick={salvarLink}>
                Salvar
              </Botao>
            </div>
          )}
          <p className="text-xs text-ink-subtle">Imagens, PDF, planilhas, documentos e apresentações até 8 MB. Vídeo ou arquivo maior: use um link.</p>
        </div>
      )}
      {erro && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
