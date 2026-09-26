import type { FrenteIA, PessoaIA, RespostaIA } from "./interpretacao";
import { diaSemana, somarDias } from "./datas";

// Interpretador por regras, usado quando não há IA configurada ou a IA
// falha. Não é tão bom quanto a IA, mas mantém o fluxo e produz a mesma
// estrutura (evidências, inferidos, ambiguidades).

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Palavras-chave por frente. A frente é achada pelo nome (sem acento), para
// funcionar com os IDs reais do banco.
const PALAVRAS_FRENTE: [string, string[]][] = [
  ["evento", ["presencial", "evento", "hotel", "sala", "brinde", "credenciamento", "palco"]],
  ["vsl", ["vsl", "aula", "modulo", "formacao"]],
  ["campanha", ["criativo", "campanha", "anuncio", "trafego", "cpa", "meta ads", "pixel"]],
  ["conteudo", ["video", "reels", "post", "carrossel", "arte", "story", "stories", "thumbnail", "capa", "gravar", "edicao", "depoimento"]],
  ["comercial", ["ligar", "lead", "venda", "follow", "checkout", "grupo vip", "inscrita", "script"]],
  ["suporte", ["aluna", "suporte", "acesso", "duvida"]],
  ["administrativo", ["nota fiscal", "notas fiscais", "pagamento", "planilha", "contrato", "comiss", "financeiro"]],
];

// Cita-se pelo primeiro nome ("pede pra Ana"), não pelo nome completo.
const primeiro = (u: PessoaIA) => normalizar(u.nome.split(" ")[0]);

const DIAS: [string, number][] = [
  ["domingo", 0], ["segunda", 1], ["terca", 2], ["quarta", 3], ["quinta", 4], ["sexta", 5], ["sabado", 6],
];

function proximoDiaSemana(hoje: string, alvo: number): string {
  const [a, m, d] = hoje.split("-").map(Number);
  const atual = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return somarDias(hoje, (alvo - atual + 7) % 7);
}

function proximoDiaDoMes(hoje: string, dia: number, mes?: number): string | null {
  const [a, m, d] = hoje.split("-").map(Number);
  let ano = a;
  let mesAlvo = mes ?? m;
  if (!mes && dia < d) mesAlvo = m + 1;
  if (mesAlvo > 12) { mesAlvo = 1; ano += 1; }
  if (mes && (mes < m || (mes === m && dia < d))) ano += 1;
  const data = new Date(Date.UTC(ano, mesAlvo - 1, dia));
  if (data.getUTCMonth() !== mesAlvo - 1) return null;
  return data.toISOString().slice(0, 10);
}

interface Prazo {
  valor: string | null;
  trecho: string | null;
  vago: string | null;
}

function detectarPrazo(seg: string, hoje: string): Prazo {
  const n = normalizar(seg);
  const vago = n.match(/semana que vem|proxima semana|quando der|logo que puder|em breve|esse mes|este mes/);
  if (vago) return { valor: null, trecho: null, vago: vago[0] };
  const dm = n.match(/(\d{1,2})\/(\d{1,2})/);
  if (dm) return { valor: proximoDiaDoMes(hoje, +dm[1], +dm[2]), trecho: dm[0], vago: null };
  const dia = n.match(/\bdia (\d{1,2})\b/);
  if (dia) return { valor: proximoDiaDoMes(hoje, +dia[1]), trecho: dia[0], vago: null };
  if (/depois de amanha/.test(n)) return { valor: somarDias(hoje, 2), trecho: "depois de amanhã", vago: null };
  if (/amanha/.test(n)) return { valor: somarDias(hoje, 1), trecho: "amanhã", vago: null };
  if (/\bhoje\b/.test(n)) return { valor: hoje, trecho: "hoje", vago: null };
  for (const [nome, num] of DIAS) {
    if (new RegExp(`\\b${nome}`).test(n)) return { valor: proximoDiaSemana(hoje, num), trecho: nome, vago: null };
  }
  return { valor: null, trecho: null, vago: null };
}

function separarEntregas(texto: string): string[] {
  return texto
    .split(/\n+|;|(?:\.\s+)|\s+e também\s+|\s+além disso,?\s+/i)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((s) => s.length > 8);
}

function montarTitulo(seg: string, usuarios: PessoaIA[]): string {
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nomes = [...new Set(usuarios.flatMap((u) => [u.nome, u.nome.split(" ")[0]]))].map(escapar).join("|") || "\\u0000";
  let t = seg
    .replace(/^e\s+/i, "")
    .replace(new RegExp(`^(?:${nomes}),\\s*`, "i"), "")
    .replace(new RegExp(`^(?:pe[çc]a|pede|pedir|avisa|avise)\\s+(?:à|a|pra|pro|para)\\s+(?:${nomes})\\s+(?:pra|para)?\\s*`, "i"), "")
    .replace(/^(?:por favor,?\s*|preciso que\s+|quero que\s+|precisamos\s+|a gente precisa\s+)/i, "")
    .replace(/,?\s*(?:é|e)\s+urgente\.?$/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 90 ? `${t.slice(0, 87)}...` : t;
}

export function interpretarSimulado(
  texto: string,
  hoje: string,
  usuarios: PessoaIA[],
  frentes: FrenteIA[]
): RespostaIA {
  const segmentos = separarEntregas(texto);
  const blocos = segmentos.length ? segmentos : [texto.trim()];

  return {
    propostas: blocos.map((seg) => {
      const n = normalizar(seg);
      const evidencias: { campo: string; trecho: string }[] = [];
      const inferidos: string[] = [];
      const ambiguidades: string[] = [];

      const citados = usuarios.filter((u) => new RegExp(`\\b${primeiro(u)}\\b`).test(n));
      const pedido = n.match(/\b(?:peca|pede|pedir|avisa|avise|cobra|cobre)\s+(?:a|à|pra|pro|para o|para a|para)\s+(\w+)/);
      let responsavel: PessoaIA | null = null;
      if (pedido) responsavel = citados.find((u) => primeiro(u) === pedido[1]) ?? null;
      if (!responsavel && citados.length === 1) responsavel = citados[0];
      if (!responsavel && citados.length > 1) {
        ambiguidades.push(`O pedido cita ${citados.map((u) => u.nome).join(" e ")}. Quem executa?`);
      }
      if (responsavel) evidencias.push({ campo: "responsavel_id", trecho: responsavel.nome });
      if (pedido && responsavel) {
        ambiguidades.push(`Confirme se ${responsavel.nome} executa ou se outra pessoa fica responsável por cobrar.`);
      }

      let frenteId: string | null = null;
      for (const [fragmento, palavras] of PALAVRAS_FRENTE) {
        const achou = palavras.find((p) => n.includes(p));
        const frente = frentes.find((f) => normalizar(f.nome).includes(fragmento));
        if (achou && frente) {
          frenteId = frente.id;
          evidencias.push({ campo: "frente_id", trecho: achou });
          inferidos.push("frente_id");
          break;
        }
      }
      if (!frenteId) ambiguidades.push("De qual frente é essa entrega?");

      if (!responsavel && frenteId) {
        const lider = usuarios.find((u) => u.id === frentes.find((f) => f.id === frenteId)?.liderId);
        if (lider) {
          responsavel = lider;
          inferidos.push("responsavel_id");
          ambiguidades.push(`Ninguém foi citado. Sugeri ${lider.nome} por liderar a frente; confirme.`);
        }
      }
      if (!responsavel && !ambiguidades.some((a) => a.includes("executa"))) {
        ambiguidades.push("Quem vai executar essa entrega?");
      }

      const prazo = detectarPrazo(seg, hoje);
      if (prazo.trecho) evidencias.push({ campo: "prazo", trecho: prazo.trecho });
      if (prazo.vago) ambiguidades.push(`"${prazo.vago}" não é uma data. Qual o prazo?`);
      else if (!prazo.valor) ambiguidades.push("O pedido não diz o prazo.");

      let prioridade: RespostaIA["propostas"][number]["prioridade"] = "media";
      if (/urgente|pra ontem|sem falta/.test(n)) {
        prioridade = "urgente";
        evidencias.push({ campo: "prioridade", trecho: n.match(/urgente|pra ontem|sem falta/)![0] });
      } else if (/prioridade|rapido|correndo|hoje/.test(n)) {
        prioridade = "alta";
        inferidos.push("prioridade");
      } else {
        inferidos.push("prioridade");
      }

      return {
        titulo: montarTitulo(seg, usuarios),
        descricao: "",
        frente_id: frenteId,
        responsavel_id: responsavel?.id ?? null,
        envolvidos_ids: citados.filter((u) => u.id !== responsavel?.id).map((u) => u.id),
        prazo: prazo.valor,
        prioridade,
        subtarefas: [],
        evidencias,
        inferidos,
        ambiguidades,
      };
    }),
  };
}

export function descricaoHoje(hoje: string): string {
  return `${diaSemana(hoje)}, ${hoje}`;
}
