"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Estado,
  EventoTarefa,
  Frente,
  Mensagem,
  PedidoEntrada,
  Proposta,
  Tarefa,
  TipoEvento,
  Usuario,
} from "./types";
import {
  FRENTES,
  USUARIOS,
  gerarEventosIniciais,
  gerarMensagensIniciais,
  gerarTarefasIniciais,
} from "./seed";
import { agoraISO } from "./datas";
import {
  cobrancaManual,
  mensagemDeAtribuicao,
  rodarCobrancas,
  type ResultadoCobrancaManual,
  type ResultadoRodada,
} from "./cobrancas";
import { DONO_ID, ehDono, estaAtiva, pendenciasParaLiberar, podeDelegarAcessos, podeGerenciarAcessos } from "./regras";

// Store em memória + localStorage — suficiente pro protótipo navegável.
// No sistema real, cada ação aqui vira uma rota do servidor com sessão
// autenticada e uma transação no Postgres (seção 8 do spec). Modelo
// horizontal: a sessão identifica quem fez, não limita o que pode fazer.

const STORAGE_KEY = "gestao-donas:v2";

interface EstadoApp {
  usuarioAtualId: string | null;
  usuarios: Usuario[];
  frentes: Frente[];
  tarefas: Tarefa[];
  eventos: EventoTarefa[];
  mensagens: Mensagem[];
  pedidos: PedidoEntrada[];
}

function estadoInicial(): EstadoApp {
  const tarefas = gerarTarefasIniciais();
  return {
    usuarioAtualId: null,
    usuarios: USUARIOS,
    frentes: FRENTES,
    tarefas,
    eventos: gerarEventosIniciais(tarefas),
    mensagens: gerarMensagensIniciais(),
    pedidos: [],
  };
}

function novoId(prefixo: string): string {
  return `${prefixo}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ResultadoEdicao = { ok: true } | { ok: false; motivo: string };

export interface EdicaoTarefa {
  titulo?: string;
  descricao?: string;
  frenteId?: string | null;
  responsavelId?: string | null;
  prazo?: string | null;
  prioridade?: Tarefa["prioridade"];
}

export interface DadosConfirmacao {
  proposta: Proposta;
  pedidoId: string;
}

export interface NovaConta {
  nome: string;
  funcao: string;
  telefone: string;
  frenteIds: string[];
}

interface ContextoGestao extends EstadoApp {
  carregado: boolean;
  usuarioAtual: Usuario | null;
  entrar: (id: string) => void;
  sair: () => void;
  criarConta: (dados: NovaConta) => { ok: true; usuario: Usuario } | { ok: false; motivo: string };
  cobrar: (tarefaId: string, recado: string) => ResultadoCobrancaManual;
  registrarPedido: (p: Omit<PedidoEntrada, "id" | "criadoEm" | "propostasConfirmadas" | "propostasDescartadas" | "autorId">) => string;
  descartarProposta: (pedidoId: string) => void;
  confirmarProposta: (d: DadosConfirmacao) => Tarefa;
  criarManual: (dados: Omit<Proposta, "id" | "evidencias" | "inferidos" | "ambiguidades" | "subtarefas" | "envolvidosIds"> & { subtarefas?: string[] }) => Tarefa;
  editarTarefa: (id: string, versaoEsperada: number, edicao: EdicaoTarefa) => ResultadoEdicao;
  mudarEstado: (id: string, para: Estado, motivo?: string) => ResultadoEdicao;
  arquivar: (id: string) => void;
  comentar: (id: string, texto: string) => void;
  alternarChecklist: (tarefaId: string, itemId: string) => void;
  simularEdicaoExterna: (id: string) => void;
  rodarCobrancasAgora: (ignorarJanela: boolean) => ResultadoRodada;
  reenviarMensagem: (id: string) => void;
  alternarPausa: (usuarioId: string) => void;
  removerAcesso: (usuarioId: string, motivo: string) => ResultadoEdicao;
  restaurarAcesso: (usuarioId: string) => ResultadoEdicao;
  definirGerenciaAcessos: (usuarioId: string, pode: boolean) => ResultadoEdicao;
  resetar: () => void;
}

// Dados salvos antes da função de acessos (24/09) não têm os campos novos:
// completa sem apagar nada do que a pessoa já fez no navegador.
function normalizarUsuario(u: Partial<Usuario> & Pick<Usuario, "id" | "nome">): Usuario {
  return {
    funcao: "",
    telefone: "",
    frenteIds: [],
    cobrancaPausada: false,
    criadoEm: "",
    criadoPorId: null,
    ...u,
    ativo: u.ativo ?? true,
    gerenciaAcessos: u.gerenciaAcessos ?? u.id === DONO_ID,
    acessoRemovidoEm: u.acessoRemovidoEm ?? null,
    acessoRemovidoPorId: u.acessoRemovidoPorId ?? null,
  };
}

const Ctx = createContext<ContextoGestao | null>(null);

export function GestaoProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoApp>(estadoInicial);
  const [carregado, setCarregado] = useState(false);
  const estadoRef = useRef(estado);
  useLayoutEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const salvo = JSON.parse(raw) as EstadoApp;
        // Hidratação do localStorage só pode acontecer depois de montar (evita divergência com o HTML do servidor).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (salvo.tarefas && salvo.usuarios) setEstado({ ...salvo, usuarios: salvo.usuarios.map(normalizarUsuario) });
      }
    } catch {
      // localStorage indisponível: segue com os dados de demonstração
    }
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!carregado) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
    } catch {
      // sem persistência, sem problema no protótipo
    }
  }, [estado, carregado]);

  // Conta sem acesso não entra: é tratada como se não houvesse sessão.
  const usuarioAtual = estado.usuarios.find((u) => u.id === estado.usuarioAtualId && u.ativo) ?? null;
  // Ações sempre registram quem fez. Sem sessão (não deveria acontecer: as
  // telas exigem entrar), o registro fica como "sem conta".
  const atorAtual = () => estadoRef.current.usuarioAtualId ?? "sem-conta";

  const evento = useCallback(
    (tarefaId: string, tipo: TipoEvento, antes: string | null, depois: string | null, atorId?: string): EventoTarefa => ({
      id: novoId("ev"),
      tarefaId,
      tipo,
      atorId: atorId ?? atorAtual(),
      antes,
      depois,
      criadoEm: agoraISO(),
    }),
    []
  );

  const nomeDe = useCallback(
    (id: string | null) =>
      id ? estadoRef.current.usuarios.find((u) => u.id === id)?.nome ?? "?" : "ninguém",
    []
  );

  const entrar = useCallback((id: string) => {
    setEstado((s) => ({ ...s, usuarioAtualId: id }));
  }, []);

  const sair = useCallback(() => {
    setEstado((s) => ({ ...s, usuarioAtualId: null }));
  }, []);

  const criarConta: ContextoGestao["criarConta"] = useCallback((dados) => {
    const nome = dados.nome.trim();
    if (!nome) return { ok: false, motivo: "Informe o nome." };
    const s = estadoRef.current;
    if (s.usuarios.some((u) => u.nome.toLowerCase() === nome.toLowerCase())) {
      return { ok: false, motivo: `Já existe uma conta chamada ${nome}. Use o sobrenome para diferenciar.` };
    }
    const telefone = dados.telefone.trim();
    if (!/^\+?[\d\s()-]{10,}$/.test(telefone)) {
      return { ok: false, motivo: "Informe o WhatsApp com DDD, por exemplo +55 82 99999-0000." };
    }
    const usuario: Usuario = {
      id: novoId("u"),
      nome,
      funcao: dados.funcao.trim() || "Equipe",
      telefone,
      frenteIds: dados.frenteIds,
      cobrancaPausada: false,
      criadoEm: agoraISO(),
      criadoPorId: s.usuarioAtualId,
      ativo: true,
      gerenciaAcessos: false,
      acessoRemovidoEm: null,
      acessoRemovidoPorId: null,
    };
    setEstado((atual) => ({ ...atual, usuarios: [...atual.usuarios, usuario] }));
    return { ok: true, usuario };
  }, []);

  const cobrar: ContextoGestao["cobrar"] = useCallback(
    (tarefaId, recado) => {
      const s = estadoRef.current;
      const t = s.tarefas.find((x) => x.id === tarefaId);
      const autor = s.usuarios.find((u) => u.id === s.usuarioAtualId);
      if (!t || !autor) return { ok: false, motivo: "Entre na sua conta para cobrar." };
      const r = cobrancaManual(t, autor, s.usuarios, s.mensagens, recado);
      if (r.ok) {
        const alvo = s.usuarios.find((u) => u.id === t.responsavelId)?.nome ?? "?";
        setEstado((atual) => ({
          ...atual,
          mensagens: [r.mensagem, ...atual.mensagens],
          eventos: [evento(tarefaId, "cobranca", null, `Cobrou ${alvo}${recado.trim() ? `: "${recado.trim()}"` : ""}`), ...atual.eventos],
        }));
      }
      return r;
    },
    [evento]
  );

  const registrarPedido: ContextoGestao["registrarPedido"] = useCallback((p) => {
    const id = novoId("in");
    setEstado((s) => ({
      ...s,
      pedidos: [
        { ...p, id, autorId: s.usuarioAtualId ?? "sem-conta", criadoEm: agoraISO(), propostasConfirmadas: 0, propostasDescartadas: 0 },
        ...s.pedidos,
      ],
    }));
    return id;
  }, []);

  const descartarProposta = useCallback((pedidoId: string) => {
    setEstado((s) => ({
      ...s,
      pedidos: s.pedidos.map((p) =>
        p.id === pedidoId ? { ...p, propostasDescartadas: p.propostasDescartadas + 1 } : p
      ),
    }));
  }, []);

  const inserirTarefa = useCallback(
    (t: Tarefa, eventos: EventoTarefa[], pedidoId?: string) => {
      setEstado((s) => {
        const msg = mensagemDeAtribuicao(t, s.usuarios, s.mensagens);
        return {
          ...s,
          tarefas: [t, ...s.tarefas],
          eventos: [...eventos, ...s.eventos],
          mensagens: msg ? [msg, ...s.mensagens] : s.mensagens,
          pedidos: pedidoId
            ? s.pedidos.map((p) =>
                p.id === pedidoId ? { ...p, propostasConfirmadas: p.propostasConfirmadas + 1 } : p
              )
            : s.pedidos,
        };
      });
    },
    []
  );

  const montarTarefa = useCallback(
    (p: Omit<Proposta, "id" | "evidencias" | "inferidos" | "ambiguidades">, origem: Tarefa["origem"]): Tarefa => {
      const agora = agoraISO();
      const base: Tarefa = {
        id: novoId("t"),
        titulo: p.titulo.trim(),
        descricao: p.descricao.trim(),
        frenteId: p.frenteId,
        responsavelId: p.responsavelId,
        envolvidosIds: p.envolvidosIds,
        criadorId: atorAtual(),
        estado: "triagem",
        estadoAnterior: null,
        motivoBloqueio: null,
        prioridade: p.prioridade,
        prazo: p.prazo,
        origem,
        versao: 1,
        checklist: p.subtarefas
          .filter((x) => x.trim())
          .map((texto) => ({ id: novoId("c"), texto: texto.trim(), concluido: false })),
        comentarios: [],
        criadoEm: agora,
        atualizadoEm: agora,
      };
      // Sem responsável, prazo ou frente confiáveis, a tarefa fica na triagem.
      if (pendenciasParaLiberar(base).length === 0) base.estado = "a_fazer";
      return base;
    },
    []
  );

  const confirmarProposta: ContextoGestao["confirmarProposta"] = useCallback(
    ({ proposta, pedidoId }) => {
      const t = montarTarefa(proposta, "ia");
      const eventos = [
        evento(t.id, "confirmada_ia", null, `Proposta da IA revisada e confirmada (${t.estado === "triagem" ? "foi pra triagem" : "liberada"})`),
        evento(t.id, "criada", null, "Criada a partir de texto livre (IA)"),
      ];
      inserirTarefa(t, eventos, pedidoId);
      return t;
    },
    [evento, inserirTarefa, montarTarefa]
  );

  const criarManual: ContextoGestao["criarManual"] = useCallback(
    (dados) => {
      const t = montarTarefa({ ...dados, subtarefas: dados.subtarefas ?? [], envolvidosIds: [] }, "manual");
      inserirTarefa(t, [evento(t.id, "criada", null, "Criada manualmente")]);
      return t;
    },
    [evento, inserirTarefa, montarTarefa]
  );

  const editarTarefa: ContextoGestao["editarTarefa"] = useCallback(
    (id, versaoEsperada, edicao) => {
      const atual = estadoRef.current.tarefas.find((t) => t.id === id);
      if (!atual) return { ok: false, motivo: "Tarefa não encontrada." };
      // Concorrência otimista: se alguém salvou antes, a edição é rejeitada (seção 10).
      if (atual.versao !== versaoEsperada) {
        return {
          ok: false,
          motivo: "Outra pessoa alterou esta tarefa enquanto você editava. Recarregue os dados e refaça a alteração.",
        };
      }
      const novos: EventoTarefa[] = [];
      if (edicao.responsavelId !== undefined && edicao.responsavelId !== atual.responsavelId)
        novos.push(evento(id, "responsavel", nomeDe(atual.responsavelId), nomeDe(edicao.responsavelId)));
      if (edicao.prazo !== undefined && edicao.prazo !== atual.prazo)
        novos.push(evento(id, "prazo", atual.prazo, edicao.prazo));
      if (edicao.prioridade !== undefined && edicao.prioridade !== atual.prioridade)
        novos.push(evento(id, "prioridade", atual.prioridade, edicao.prioridade));
      const atualizada: Tarefa = {
        ...atual,
        ...edicao,
        versao: atual.versao + 1,
        atualizadoEm: agoraISO(),
      };
      setEstado((s) => {
        const msg =
          edicao.responsavelId !== undefined && edicao.responsavelId !== atual.responsavelId
            ? mensagemDeAtribuicao(atualizada, s.usuarios, s.mensagens)
            : null;
        return {
          ...s,
          tarefas: s.tarefas.map((t) => (t.id === id ? atualizada : t)),
          eventos: [...novos, ...s.eventos],
          mensagens: msg ? [msg, ...s.mensagens] : s.mensagens,
        };
      });
      return { ok: true };
    },
    [evento, nomeDe]
  );

  const mudarEstado: ContextoGestao["mudarEstado"] = useCallback(
    (id, para, motivo) => {
      const atual = estadoRef.current.tarefas.find((t) => t.id === id);
      if (!atual) return { ok: false, motivo: "Tarefa não encontrada." };
      if (para === "bloqueada" && !motivo?.trim())
        return { ok: false, motivo: "Informe o motivo do bloqueio." };
      if (atual.estado === "triagem") {
        const faltas = pendenciasParaLiberar(atual);
        if (faltas.length) return { ok: false, motivo: `Defina ${faltas.join(", ")} antes de liberar.` };
      }
      const atualizada: Tarefa = {
        ...atual,
        estado: para,
        estadoAnterior: para === "bloqueada" ? atual.estado : null,
        motivoBloqueio: para === "bloqueada" ? motivo!.trim() : null,
        versao: atual.versao + 1,
        atualizadoEm: agoraISO(),
      };
      const detalhe = para === "bloqueada" ? ` — motivo: ${motivo!.trim()}` : "";
      setEstado((s) => {
        const msg = atual.estado === "triagem" ? mensagemDeAtribuicao(atualizada, s.usuarios, s.mensagens) : null;
        return {
          ...s,
          tarefas: s.tarefas.map((t) => (t.id === id ? atualizada : t)),
          eventos: [evento(id, "estado", atual.estado, `${para}${detalhe}`), ...s.eventos],
          mensagens: msg ? [msg, ...s.mensagens] : s.mensagens,
        };
      });
      return { ok: true };
    },
    [evento]
  );

  const arquivar = useCallback(
    (id: string) => {
      setEstado((s) => {
        const atual = s.tarefas.find((t) => t.id === id);
        if (!atual) return s;
        return {
          ...s,
          tarefas: s.tarefas.map((t) =>
            t.id === id ? { ...t, estado: "arquivada", versao: t.versao + 1, atualizadoEm: agoraISO() } : t
          ),
          eventos: [evento(id, "estado", atual.estado, "arquivada"), ...s.eventos],
        };
      });
    },
    [evento]
  );

  const comentar = useCallback(
    (id: string, texto: string) => {
      setEstado((s) => ({
        ...s,
        tarefas: s.tarefas.map((t) =>
          t.id === id
            ? {
                ...t,
                comentarios: [
                  ...t.comentarios,
                  { id: novoId("cm"), autorId: s.usuarioAtualId ?? "sem-conta", texto, criadoEm: agoraISO() },
                ],
                atualizadoEm: agoraISO(),
              }
            : t
        ),
        eventos: [evento(id, "comentario", null, texto), ...s.eventos],
      }));
    },
    [evento]
  );

  const alternarChecklist = useCallback(
    (tarefaId: string, itemId: string) => {
      setEstado((s) => {
        const t = s.tarefas.find((x) => x.id === tarefaId);
        const item = t?.checklist.find((c) => c.id === itemId);
        if (!t || !item) return s;
        return {
          ...s,
          tarefas: s.tarefas.map((x) =>
            x.id === tarefaId
              ? {
                  ...x,
                  checklist: x.checklist.map((c) =>
                    c.id === itemId ? { ...c, concluido: !c.concluido } : c
                  ),
                }
              : x
          ),
          eventos: [
            evento(tarefaId, "checklist", null, `${item.concluido ? "Desmarcou" : "Marcou"}: ${item.texto}`),
            ...s.eventos,
          ],
        };
      });
    },
    [evento]
  );

  // Só pra demonstrar o critério "dois gestores no mesmo card" (seção 10).
  const simularEdicaoExterna = useCallback(
    (id: string) => {
      setEstado((s) => ({
        ...s,
        tarefas: s.tarefas.map((t) =>
          t.id === id
            ? { ...t, prioridade: t.prioridade === "urgente" ? "alta" : "urgente", versao: t.versao + 1, atualizadoEm: agoraISO() }
            : t
        ),
        eventos: [evento(id, "prioridade", null, "alterada por Scarlett em outra aba", "u-scarlett"), ...s.eventos],
      }));
    },
    [evento]
  );

  const rodarCobrancasAgora = useCallback((ignorarJanela: boolean) => {
    const s = estadoRef.current;
    const resultado = rodarCobrancas(s.tarefas, s.usuarios, s.mensagens, { ignorarJanela });
    setEstado((atual) => ({ ...atual, mensagens: [...resultado.novas, ...atual.mensagens] }));
    return resultado;
  }, []);

  const reenviarMensagem = useCallback((id: string) => {
    setEstado((s) => ({
      ...s,
      mensagens: s.mensagens.map((m) =>
        m.id === id ? { ...m, status: "enviado", motivo: null, tentativas: m.tentativas + 1 } : m
      ),
    }));
  }, []);

  const alternarPausa = useCallback((usuarioId: string) => {
    setEstado((s) => ({
      ...s,
      usuarios: s.usuarios.map((u) =>
        u.id === usuarioId ? { ...u, cobrancaPausada: !u.cobrancaPausada } : u
      ),
    }));
  }, []);

  // ---- Acessos: só o dono (Ítalo) e quem ele autorizar ----

  const removerAcesso: ContextoGestao["removerAcesso"] = useCallback(
    (usuarioId, motivo) => {
      const s = estadoRef.current;
      const quem = s.usuarios.find((u) => u.id === s.usuarioAtualId);
      const alvo = s.usuarios.find((u) => u.id === usuarioId);
      if (!podeGerenciarAcessos(quem)) return { ok: false, motivo: "Só o Ítalo e quem ele autorizar podem remover acessos." };
      if (!alvo || !alvo.ativo) return { ok: false, motivo: "Essa conta já está sem acesso." };
      if (ehDono(alvo)) return { ok: false, motivo: "O acesso do Ítalo não pode ser removido." };
      if (alvo.id === quem!.id) return { ok: false, motivo: "Você não pode remover o seu próprio acesso." };
      if (alvo.gerenciaAcessos && !ehDono(quem)) {
        return { ok: false, motivo: "Só o Ítalo remove o acesso de quem também gerencia acessos." };
      }
      const agora = agoraISO();
      const detalhe = `Acesso de ${alvo.nome} removido por ${quem!.nome}${motivo.trim() ? `: ${motivo.trim()}` : ""}`;
      // Tarefas abertas da pessoa voltam para a triagem, sem dono, para alguém reassumir.
      const afetadas = s.tarefas.filter((t) => t.responsavelId === alvo.id && estaAtiva(t));
      setEstado((atual) => ({
        ...atual,
        usuarios: atual.usuarios.map((u) =>
          u.id === alvo.id
            ? { ...u, ativo: false, gerenciaAcessos: false, acessoRemovidoEm: agora, acessoRemovidoPorId: quem!.id }
            : u
        ),
        tarefas: atual.tarefas.map((t) =>
          afetadas.some((a) => a.id === t.id)
            ? { ...t, responsavelId: null, estado: "triagem", estadoAnterior: null, motivoBloqueio: null, versao: t.versao + 1, atualizadoEm: agora }
            : t
        ),
        mensagens: atual.mensagens.map((m) =>
          m.destinatarioId === alvo.id && m.status === "pendente"
            ? { ...m, status: "ignorado", motivo: "Essa pessoa não tem mais acesso ao sistema" }
            : m
        ),
        eventos: [
          ...afetadas.map((t) => evento(t.id, "acesso", alvo.nome, `${detalhe}. A tarefa voltou para a triagem.`)),
          ...atual.eventos,
        ],
      }));
      return { ok: true };
    },
    [evento]
  );

  const restaurarAcesso: ContextoGestao["restaurarAcesso"] = useCallback((usuarioId) => {
    const s = estadoRef.current;
    const quem = s.usuarios.find((u) => u.id === s.usuarioAtualId);
    if (!podeGerenciarAcessos(quem)) return { ok: false, motivo: "Só o Ítalo e quem ele autorizar podem restaurar acessos." };
    setEstado((atual) => ({
      ...atual,
      usuarios: atual.usuarios.map((u) =>
        u.id === usuarioId ? { ...u, ativo: true, acessoRemovidoEm: null, acessoRemovidoPorId: null } : u
      ),
    }));
    return { ok: true };
  }, []);

  const definirGerenciaAcessos: ContextoGestao["definirGerenciaAcessos"] = useCallback((usuarioId, pode) => {
    const s = estadoRef.current;
    const quem = s.usuarios.find((u) => u.id === s.usuarioAtualId);
    if (!podeDelegarAcessos(quem)) return { ok: false, motivo: "Só o Ítalo decide quem mais pode gerenciar acessos." };
    if (usuarioId === DONO_ID) return { ok: false, motivo: "O Ítalo sempre gerencia acessos." };
    setEstado((atual) => ({
      ...atual,
      usuarios: atual.usuarios.map((u) => (u.id === usuarioId && u.ativo ? { ...u, gerenciaAcessos: pode } : u)),
    }));
    return { ok: true };
  }, []);

  const resetar = useCallback(() => {
    const novo = estadoInicial();
    setEstado((s) => ({ ...novo, usuarioAtualId: s.usuarioAtualId }));
  }, []);

  const valor = useMemo<ContextoGestao>(
    () => ({
      ...estado,
      carregado,
      usuarioAtual,
      entrar,
      sair,
      criarConta,
      cobrar,
      registrarPedido,
      descartarProposta,
      confirmarProposta,
      criarManual,
      editarTarefa,
      mudarEstado,
      arquivar,
      comentar,
      alternarChecklist,
      simularEdicaoExterna,
      rodarCobrancasAgora,
      reenviarMensagem,
      alternarPausa,
      removerAcesso,
      restaurarAcesso,
      definirGerenciaAcessos,
      resetar,
    }),
    [
      estado, carregado, usuarioAtual, entrar, sair, criarConta, cobrar, registrarPedido, descartarProposta,
      confirmarProposta, criarManual, editarTarefa, mudarEstado, arquivar, comentar,
      alternarChecklist, simularEdicaoExterna, rodarCobrancasAgora, reenviarMensagem,
      alternarPausa, removerAcesso, restaurarAcesso, definirGerenciaAcessos, resetar,
    ]
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useGestao(): ContextoGestao {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGestao precisa estar dentro de GestaoProvider");
  return ctx;
}
