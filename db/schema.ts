// Esquema do Postgres do sistema de gestão Donas de Loja (Fase 3).
// Espelha os tipos do protótipo (lib/types.ts) e as tabelas da seção 8 do
// spec, com o que mudou em 24/09: modelo horizontal (sem papéis), acesso
// controlado pelo dono (Ítalo) e por quem ele autorizar, cobrança manual.
// Nomes em português e snake_case no banco. Migrações em ./drizzle.

import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();

// ---------- Enums ----------

export const estadoTarefa = pgEnum("estado_tarefa", [
  "triagem",
  "a_fazer",
  "em_andamento",
  "em_revisao",
  "bloqueada",
  "concluida",
  "arquivada",
]);
export const prioridade = pgEnum("prioridade", ["baixa", "media", "alta", "urgente"]);
export const origemTarefa = pgEnum("origem_tarefa", ["manual", "ia"]);
export const tipoEventoTarefa = pgEnum("tipo_evento_tarefa", [
  "criada",
  "confirmada_ia",
  "estado",
  "responsavel",
  "prazo",
  "prioridade",
  "comentario",
  "checklist",
  "cobranca",
  "acesso",
  "anexo",
]);
export const tipoEventoAcesso = pgEnum("tipo_evento_acesso", [
  "conta_criada",
  "convite_criado",
  "acesso_removido",
  "acesso_restaurado",
  "permissao_dada",
  "permissao_retirada",
  "login",
  "login_falhou",
  "redefinicao_pedida",
]);
export const regraCobranca = pgEnum("regra_cobranca", [
  "atribuicao",
  "prazo_proximo",
  "vencida",
  "escalonamento",
  "cobranca_manual",
  "resumo_diario",
  "redefinir_senha",
  "revisao",
]);
export const statusEnvio = pgEnum("status_envio", ["pendente", "enviando", "enviado", "falhou", "ignorado"]);
export const modoInterpretacao = pgEnum("modo_interpretacao", ["ia", "regras"]);
export const situacaoProposta = pgEnum("situacao_proposta", ["aberta", "confirmada", "descartada"]);
export const frequenciaRecorrencia = pgEnum("frequencia_recorrencia", ["diaria", "semanal", "mensal", "anual", "personalizada"]);
export const estadoSerie = pgEnum("estado_serie", ["ativa", "pausada", "encerrada"]);
export const origemOcorrencia = pgEnum("origem_ocorrencia", ["automatica", "criada_na_serie"]);

// ---------- Pessoas, login e acesso ----------

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    funcao: text("funcao").notNull().default(""),
    email: text("email").notNull(),
    senhaHash: text("senha_hash"), // null até a pessoa aceitar o convite
    telefoneWhatsapp: text("telefone_whatsapp").notNull(),
    cobrancaPausada: boolean("cobranca_pausada").notNull().default(false),
    // Acesso: único ponto não horizontal do sistema.
    ativo: boolean("ativo").notNull().default(true),
    dono: boolean("dono").notNull().default(false), // o Ítalo; exatamente um
    gerenciaAcessos: boolean("gerencia_acessos").notNull().default(false),
    acessoRemovidoEm: timestamp("acesso_removido_em", { withTimezone: true }),
    acessoRemovidoPorId: uuid("acesso_removido_por_id"),
    criadoPorId: uuid("criado_por_id"),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("usuarios_email_unico").on(sql`lower(${t.email})`),
    uniqueIndex("usuarios_um_dono").on(t.dono).where(sql`${t.dono}`),
    check("dono_sempre_ativo", sql`NOT ${t.dono} OR ${t.ativo}`),
    check("dono_gerencia_acessos", sql`NOT ${t.dono} OR ${t.gerenciaAcessos}`),
    check("removido_tem_data", sql`${t.ativo} OR ${t.acessoRemovidoEm} IS NOT NULL`),
  ]
);

// Sessão no servidor. Remover acesso apaga todas as sessões da pessoa.
export const sessoes = pgTable(
  "sessoes",
  {
    tokenHash: text("token_hash").primaryKey(), // sha-256 do token do cookie; o token em si nunca é gravado
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
    criadoEm: criadoEm(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    ultimoUsoEm: timestamp("ultimo_uso_em", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessoes_por_usuario").on(t.usuarioId)]
);

// Convite por link com expiração: substitui o "criar conta" aberto do protótipo.
export const convites = pgTable(
  "convites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    nome: text("nome").notNull(),
    telefoneWhatsapp: text("telefone_whatsapp"),
    email: text("email"),
    criadoPorId: uuid("criado_por_id").notNull().references(() => usuarios.id),
    criadoEm: criadoEm(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    usadoEm: timestamp("usado_em", { withTimezone: true }),
    usadoPorId: uuid("usado_por_id").references(() => usuarios.id),
  },
  (t) => [uniqueIndex("convites_token_unico").on(t.tokenHash)]
);

// Auditoria de acesso: quem removeu, restaurou, deu permissão. Só insere.
export const eventosAcesso = pgTable(
  "eventos_acesso",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tipo: tipoEventoAcesso("tipo").notNull(),
    atorId: uuid("ator_id").references(() => usuarios.id),
    alvoId: uuid("alvo_id").references(() => usuarios.id),
    motivo: text("motivo"),
    detalhes: jsonb("detalhes"),
    criadoEm: criadoEm(),
  },
  (t) => [index("eventos_acesso_por_alvo").on(t.alvoId, t.criadoEm)]
);

// ---------- Frentes ----------

export const frentes = pgTable("frentes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  // Pessoa de referência: só sugere responsável para a IA. Não dá poder nenhum.
  referenciaId: uuid("referencia_id").references(() => usuarios.id),
  usaRevisao: boolean("usa_revisao").notNull().default(false),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm: criadoEm(),
});

export const usuarioFrentes = pgTable(
  "usuario_frentes",
  {
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
    frenteId: uuid("frente_id").notNull().references(() => frentes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.frenteId] })]
);

// ---------- Entrada inteligente ----------

export const pedidosEntrada = pgTable(
  "pedidos_entrada",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    autorId: uuid("autor_id").notNull().references(() => usuarios.id),
    texto: text("texto").notNull(),
    modo: modoInterpretacao("modo").notNull(),
    provedor: text("provedor"), // openai | anthropic | null (regras)
    modelo: text("modelo"),
    versaoPrompt: text("versao_prompt").notNull(),
    criadoEm: criadoEm(),
    // Retenção do texto livre: definir política antes da produção (spec, seção 6).
    apagarTextoEm: timestamp("apagar_texto_em", { withTimezone: true }),
  },
  (t) => [index("pedidos_por_autor").on(t.autorId, t.criadoEm)]
);

export const propostasIa = pgTable(
  "propostas_ia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id").notNull().references(() => pedidosEntrada.id, { onDelete: "cascade" }),
    ordem: smallint("ordem").notNull(),
    // Proposta como a IA devolveu (validada no servidor) e como foi confirmada.
    original: jsonb("original").notNull(),
    confirmada: jsonb("confirmada"),
    situacao: situacaoProposta("situacao").notNull().default("aberta"),
    tarefaId: uuid("tarefa_id").references(() => tarefas.id),
    revisadaPorId: uuid("revisada_por_id").references(() => usuarios.id),
    revisadaEm: timestamp("revisada_em", { withTimezone: true }),
  },
  (t) => [uniqueIndex("propostas_ordem_unica").on(t.pedidoId, t.ordem)]
);

// ---------- Tarefas ----------

// Regra da série; tarefas já criadas mantêm responsável, prazo e histórico próprios.
export const seriesRecorrentes = pgTable(
  "series_recorrentes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titulo: text("titulo").notNull(),
    descricao: text("descricao").notNull().default(""),
    frenteId: uuid("frente_id").notNull().references(() => frentes.id),
    prioridade: prioridade("prioridade").notNull().default("media"),
    frequencia: frequenciaRecorrencia("frequencia").notNull(),
    intervalo: integer("intervalo").notNull().default(1),
    diasSemana: integer("dias_semana").array(),
    diaMes: smallint("dia_mes"),
    ultimoDiaMes: boolean("ultimo_dia_mes").notNull().default(false),
    mesAno: smallint("mes_ano"),
    diaAno: smallint("dia_ano"),
    inicioEm: date("inicio_em").notNull(),
    gerarDesde: date("gerar_desde").notNull(),
    fimEm: date("fim_em"),
    horaVencimento: text("hora_vencimento"),
    timezone: text("timezone").notNull().default("America/Recife"),
    responsavelId: uuid("responsavel_id").notNull().references(() => usuarios.id),
    criadoPorId: uuid("criado_por_id").notNull().references(() => usuarios.id),
    estado: estadoSerie("estado").notNull().default("ativa"),
    requerAtencao: boolean("requer_atencao").notNull().default(false),
    pausadaEm: timestamp("pausada_em", { withTimezone: true }),
    pausadaPorId: uuid("pausada_por_id").references(() => usuarios.id),
    motivoPausa: text("motivo_pausa"),
    encerradaEm: timestamp("encerrada_em", { withTimezone: true }),
    encerradaPorId: uuid("encerrada_por_id").references(() => usuarios.id),
    motivoEncerramento: text("motivo_encerramento"),
    versao: integer("versao").notNull().default(1),
    criadaEm: criadoEm(),
    atualizadaEm: timestamp("atualizada_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("series_por_estado").on(t.estado),
    check("serie_intervalo_positivo", sql`${t.intervalo} > 0`),
    check("serie_fim_valido", sql`${t.fimEm} IS NULL OR ${t.fimEm} >= ${t.inicioEm}`),
    check("serie_fuso_recife", sql`${t.timezone} = 'America/Recife'`),
    check("serie_hora_valida", sql`${t.horaVencimento} IS NULL OR ${t.horaVencimento} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("serie_dias_validos", sql`${t.diasSemana} IS NULL OR (${t.diasSemana} <@ ARRAY[1,2,3,4,5,6,7]::integer[] AND cardinality(${t.diasSemana}) BETWEEN 1 AND 7)`),
    check("serie_regra_valida", sql`COALESCE((
      (${t.frequencia} = 'diaria' AND ${t.diasSemana} IS NULL AND ${t.diaMes} IS NULL AND ${t.mesAno} IS NULL AND ${t.diaAno} IS NULL AND NOT ${t.ultimoDiaMes})
      OR (${t.frequencia} IN ('semanal','personalizada') AND cardinality(${t.diasSemana}) >= 1 AND ${t.diaMes} IS NULL AND ${t.mesAno} IS NULL AND ${t.diaAno} IS NULL AND NOT ${t.ultimoDiaMes})
      OR (${t.frequencia} = 'mensal' AND ${t.diasSemana} IS NULL AND ((${t.diaMes} BETWEEN 1 AND 31 AND NOT ${t.ultimoDiaMes}) OR (${t.diaMes} IS NULL AND ${t.ultimoDiaMes})) AND ${t.mesAno} IS NULL AND ${t.diaAno} IS NULL)
      OR (${t.frequencia} = 'anual' AND ${t.diasSemana} IS NULL AND ${t.diaMes} IS NULL AND NOT ${t.ultimoDiaMes} AND ${t.mesAno} BETWEEN 1 AND 12 AND ${t.diaAno} BETWEEN 1 AND 31)
    ), false)`),
  ]
);

export const eventosSerie = pgTable(
  "eventos_serie",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    serieId: uuid("serie_id").notNull().references(() => seriesRecorrentes.id),
    tipo: text("tipo").notNull(),
    atorId: uuid("ator_id").notNull().references(() => usuarios.id),
    antes: jsonb("antes"),
    depois: jsonb("depois"),
    criadoEm: criadoEm(),
  },
  (t) => [index("eventos_por_serie").on(t.serieId, t.criadoEm)]
);

export const tarefas = pgTable(
  "tarefas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titulo: text("titulo").notNull(),
    descricao: text("descricao").notNull().default(""),
    frenteId: uuid("frente_id").references(() => frentes.id),
    responsavelId: uuid("responsavel_id").references(() => usuarios.id),
    criadorId: uuid("criador_id").notNull().references(() => usuarios.id), // quem pediu
    estado: estadoTarefa("estado").notNull().default("triagem"),
    estadoAnterior: estadoTarefa("estado_anterior"), // volta de bloqueio e desfazer arquivamento
    motivoBloqueio: text("motivo_bloqueio"),
    prioridade: prioridade("prioridade").notNull().default("media"),
    prazo: date("prazo"), // dia no fuso America/Recife
    prazoHora: text("prazo_hora"), // "HH:MM" opcional; sem hora = até o fim do dia
    origem: origemTarefa("origem").notNull().default("manual"),
    pedidoId: uuid("pedido_id").references(() => pedidosEntrada.id),
    serieRecorrenteId: uuid("serie_recorrente_id").references(() => seriesRecorrentes.id),
    chaveOcorrencia: text("chave_ocorrencia"),
    dataProgramadaLocal: date("data_programada_local"),
    geradaEm: timestamp("gerada_em", { withTimezone: true }),
    origemOcorrencia: origemOcorrencia("origem_ocorrencia"),
    versao: integer("versao").notNull().default(1), // concorrência otimista
    criadoEm: criadoEm(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tarefas_por_responsavel").on(t.responsavelId, t.estado, t.prazo),
    index("tarefas_por_frente").on(t.frenteId, t.estado, t.prazo),
    index("tarefas_por_criador").on(t.criadorId, t.estado),
    uniqueIndex("tarefas_ocorrencia_unica").on(t.serieRecorrenteId, t.chaveOcorrencia),
    check("ocorrencia_completa", sql`(${t.serieRecorrenteId} IS NULL AND ${t.chaveOcorrencia} IS NULL AND ${t.dataProgramadaLocal} IS NULL AND ${t.geradaEm} IS NULL AND ${t.origemOcorrencia} IS NULL) OR (${t.serieRecorrenteId} IS NOT NULL AND ${t.chaveOcorrencia} IS NOT NULL AND ${t.dataProgramadaLocal} IS NOT NULL AND ${t.geradaEm} IS NOT NULL AND ${t.origemOcorrencia} IS NOT NULL)`),
    check("prazo_hora_valida", sql`${t.prazoHora} IS NULL OR (${t.prazo} IS NOT NULL AND ${t.prazoHora} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`),
    check("bloqueio_tem_motivo", sql`${t.estado} <> 'bloqueada' OR ${t.motivoBloqueio} IS NOT NULL`),
    // Só sai da triagem com dono, prazo e frente (spec, seção 4).
    check(
      "liberada_completa",
      sql`${t.estado} IN ('triagem', 'arquivada', 'concluida') OR (${t.responsavelId} IS NOT NULL AND ${t.prazo} IS NOT NULL AND ${t.frenteId} IS NOT NULL)`
    ),
  ]
);

export const tarefaEnvolvidos = pgTable(
  "tarefa_envolvidos",
  {
    tarefaId: uuid("tarefa_id").notNull().references(() => tarefas.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    papel: text("papel").notNull().default("citado"), // citado | aprova | avisar
  },
  (t) => [primaryKey({ columns: [t.tarefaId, t.usuarioId] })]
);

export const checklistItens = pgTable("checklist_itens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tarefaId: uuid("tarefa_id").notNull().references(() => tarefas.id, { onDelete: "cascade" }),
  texto: text("texto").notNull(),
  ordem: smallint("ordem").notNull(),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  concluidoPorId: uuid("concluido_por_id").references(() => usuarios.id),
});

// Modelos de checklist (bloco D): listas de passos reaproveitáveis, como
// "Presencial: pré-evento". Modelo horizontal: qualquer conta cria e usa.
// Arquivar em vez de apagar, para não sumir de quem estava usando.
export const modelosChecklist = pgTable(
  "modelos_checklist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    itens: text("itens").array().notNull(),
    frenteId: uuid("frente_id").references(() => frentes.id),
    criadoPorId: uuid("criado_por_id").notNull().references(() => usuarios.id),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("modelos_nome_unico").on(sql`lower(${t.nome})`).where(sql`${t.ativo}`)]
);

export const comentarios = pgTable(
  "comentarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tarefaId: uuid("tarefa_id").notNull().references(() => tarefas.id, { onDelete: "cascade" }),
    autorId: uuid("autor_id").notNull().references(() => usuarios.id),
    texto: text("texto").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("comentarios_por_tarefa").on(t.tarefaId, t.criadoEm)]
);

// Arquivo fica no armazenamento de objetos; aqui só a referência (spec, seção 8).
export const anexos = pgTable("anexos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tarefaId: uuid("tarefa_id").notNull().references(() => tarefas.id, { onDelete: "cascade" }),
  autorId: uuid("autor_id").notNull().references(() => usuarios.id),
  nome: text("nome").notNull(),
  chaveObjeto: text("chave_objeto"), // arquivo enviado
  url: text("url"), // link externo
  tipo: text("tipo"),
  tamanhoBytes: integer("tamanho_bytes"),
  criadoEm: criadoEm(),
});

// Histórico imutável: trigger na migração 0001 bloqueia UPDATE e DELETE.
export const eventosTarefa = pgTable(
  "eventos_tarefa",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tarefaId: uuid("tarefa_id").notNull().references(() => tarefas.id),
    tipo: tipoEventoTarefa("tipo").notNull(),
    atorId: uuid("ator_id").references(() => usuarios.id),
    antes: text("antes"),
    depois: text("depois"),
    criadoEm: criadoEm(),
  },
  (t) => [index("eventos_por_tarefa").on(t.tarefaId, t.criadoEm)]
);

// ---------- Cobranças (fila de saída que o n8n consome) ----------

export const configCobranca = pgTable(
  "config_cobranca",
  {
    id: smallint("id").primaryKey().default(1), // linha única
    ativa: boolean("ativa").notNull().default(true),
    janelaInicio: smallint("janela_inicio").notNull().default(8),
    janelaFim: smallint("janela_fim").notNull().default(19),
    diasParaAvisarQuemPediu: smallint("dias_para_avisar_quem_pediu").notNull().default(2),
    limiteDiarioPorPessoa: smallint("limite_diario_por_pessoa").notNull().default(8),
    atualizadoPorId: uuid("atualizado_por_id").references(() => usuarios.id),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("linha_unica", sql`${t.id} = 1`), check("janela_valida", sql`${t.janelaInicio} < ${t.janelaFim}`)]
);

export const mensagens = pgTable(
  "mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // tarefa + regra + janela + destinatário (+ autor na cobrança manual): repetir não duplica.
    chave: text("chave").notNull(),
    tarefaId: uuid("tarefa_id").references(() => tarefas.id),
    regra: regraCobranca("regra").notNull(),
    autorId: uuid("autor_id").references(() => usuarios.id), // null = automática
    destinatarioId: uuid("destinatario_id").notNull().references(() => usuarios.id),
    texto: text("texto").notNull(),
    status: statusEnvio("status").notNull().default("pendente"),
    motivo: text("motivo"),
    tentativas: smallint("tentativas").notNull().default(0),
    agendadaPara: timestamp("agendada_para", { withTimezone: true }).notNull().defaultNow(),
    reservadaAte: timestamp("reservada_ate", { withTimezone: true }), // trava do n8n enquanto envia
    enviadaEm: timestamp("enviada_em", { withTimezone: true }),
    idProvedor: text("id_provedor"), // id da mensagem no WhatsApp
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("mensagens_chave_unica").on(t.chave),
    index("mensagens_fila").on(t.status, t.agendadaPara),
    index("mensagens_por_destinatario").on(t.destinatarioId, t.criadoEm),
  ]
);
