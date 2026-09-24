CREATE TYPE "public"."estado_tarefa" AS ENUM('triagem', 'a_fazer', 'em_andamento', 'em_revisao', 'bloqueada', 'concluida', 'arquivada');--> statement-breakpoint
CREATE TYPE "public"."modo_interpretacao" AS ENUM('ia', 'regras');--> statement-breakpoint
CREATE TYPE "public"."origem_tarefa" AS ENUM('manual', 'ia');--> statement-breakpoint
CREATE TYPE "public"."prioridade" AS ENUM('baixa', 'media', 'alta', 'urgente');--> statement-breakpoint
CREATE TYPE "public"."regra_cobranca" AS ENUM('atribuicao', 'prazo_proximo', 'vencida', 'escalonamento', 'cobranca_manual', 'resumo_diario');--> statement-breakpoint
CREATE TYPE "public"."situacao_proposta" AS ENUM('aberta', 'confirmada', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."status_envio" AS ENUM('pendente', 'enviando', 'enviado', 'falhou', 'ignorado');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento_acesso" AS ENUM('conta_criada', 'convite_criado', 'acesso_removido', 'acesso_restaurado', 'permissao_dada', 'permissao_retirada', 'login', 'login_falhou');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento_tarefa" AS ENUM('criada', 'confirmada_ia', 'estado', 'responsavel', 'prazo', 'prioridade', 'comentario', 'checklist', 'cobranca', 'acesso');--> statement-breakpoint
CREATE TABLE "anexos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarefa_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"chave_objeto" text,
	"url" text,
	"tipo" text,
	"tamanho_bytes" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarefa_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"ordem" smallint NOT NULL,
	"concluido_em" timestamp with time zone,
	"concluido_por_id" uuid
);
--> statement-breakpoint
CREATE TABLE "comentarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarefa_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_cobranca" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"janela_inicio" smallint DEFAULT 8 NOT NULL,
	"janela_fim" smallint DEFAULT 19 NOT NULL,
	"dias_para_avisar_quem_pediu" smallint DEFAULT 2 NOT NULL,
	"limite_diario_por_pessoa" smallint DEFAULT 8 NOT NULL,
	"atualizado_por_id" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linha_unica" CHECK ("config_cobranca"."id" = 1),
	CONSTRAINT "janela_valida" CHECK ("config_cobranca"."janela_inicio" < "config_cobranca"."janela_fim")
);
--> statement-breakpoint
CREATE TABLE "convites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"nome" text NOT NULL,
	"telefone_whatsapp" text,
	"email" text,
	"criado_por_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"usado_por_id" uuid
);
--> statement-breakpoint
CREATE TABLE "eventos_acesso" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tipo" "tipo_evento_acesso" NOT NULL,
	"ator_id" uuid,
	"alvo_id" uuid,
	"motivo" text,
	"detalhes" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_tarefa" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tarefa_id" uuid NOT NULL,
	"tipo" "tipo_evento_tarefa" NOT NULL,
	"ator_id" uuid,
	"antes" text,
	"depois" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"referencia_id" uuid,
	"usa_revisao" boolean DEFAULT false NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" text NOT NULL,
	"tarefa_id" uuid,
	"regra" "regra_cobranca" NOT NULL,
	"autor_id" uuid,
	"destinatario_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"status" "status_envio" DEFAULT 'pendente' NOT NULL,
	"motivo" text,
	"tentativas" smallint DEFAULT 0 NOT NULL,
	"agendada_para" timestamp with time zone DEFAULT now() NOT NULL,
	"reservada_ate" timestamp with time zone,
	"enviada_em" timestamp with time zone,
	"id_provedor" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos_entrada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"autor_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"modo" "modo_interpretacao" NOT NULL,
	"provedor" text,
	"modelo" text,
	"versao_prompt" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"apagar_texto_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "propostas_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"ordem" smallint NOT NULL,
	"original" jsonb NOT NULL,
	"confirmada" jsonb,
	"situacao" "situacao_proposta" DEFAULT 'aberta' NOT NULL,
	"tarefa_id" uuid,
	"revisada_por_id" uuid,
	"revisada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "tarefa_envolvidos" (
	"tarefa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" text DEFAULT 'citado' NOT NULL,
	CONSTRAINT "tarefa_envolvidos_tarefa_id_usuario_id_pk" PRIMARY KEY("tarefa_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"frente_id" uuid,
	"responsavel_id" uuid,
	"criador_id" uuid NOT NULL,
	"estado" "estado_tarefa" DEFAULT 'triagem' NOT NULL,
	"estado_anterior" "estado_tarefa",
	"motivo_bloqueio" text,
	"prioridade" "prioridade" DEFAULT 'media' NOT NULL,
	"prazo" date,
	"origem" "origem_tarefa" DEFAULT 'manual' NOT NULL,
	"pedido_id" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bloqueio_tem_motivo" CHECK ("tarefas"."estado" <> 'bloqueada' OR "tarefas"."motivo_bloqueio" IS NOT NULL),
	CONSTRAINT "liberada_completa" CHECK ("tarefas"."estado" IN ('triagem', 'arquivada', 'concluida') OR ("tarefas"."responsavel_id" IS NOT NULL AND "tarefas"."prazo" IS NOT NULL AND "tarefas"."frente_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "usuario_frentes" (
	"usuario_id" uuid NOT NULL,
	"frente_id" uuid NOT NULL,
	CONSTRAINT "usuario_frentes_usuario_id_frente_id_pk" PRIMARY KEY("usuario_id","frente_id")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"funcao" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text,
	"telefone_whatsapp" text NOT NULL,
	"cobranca_pausada" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"dono" boolean DEFAULT false NOT NULL,
	"gerencia_acessos" boolean DEFAULT false NOT NULL,
	"acesso_removido_em" timestamp with time zone,
	"acesso_removido_por_id" uuid,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dono_sempre_ativo" CHECK (NOT "usuarios"."dono" OR "usuarios"."ativo"),
	CONSTRAINT "dono_gerencia_acessos" CHECK (NOT "usuarios"."dono" OR "usuarios"."gerencia_acessos"),
	CONSTRAINT "removido_tem_data" CHECK ("usuarios"."ativo" OR "usuarios"."acesso_removido_em" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_concluido_por_id_usuarios_id_fk" FOREIGN KEY ("concluido_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_cobranca" ADD CONSTRAINT "config_cobranca_atualizado_por_id_usuarios_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_usado_por_id_usuarios_id_fk" FOREIGN KEY ("usado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_acesso" ADD CONSTRAINT "eventos_acesso_ator_id_usuarios_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_acesso" ADD CONSTRAINT "eventos_acesso_alvo_id_usuarios_id_fk" FOREIGN KEY ("alvo_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_tarefa" ADD CONSTRAINT "eventos_tarefa_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_tarefa" ADD CONSTRAINT "eventos_tarefa_ator_id_usuarios_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frentes" ADD CONSTRAINT "frentes_referencia_id_usuarios_id_fk" FOREIGN KEY ("referencia_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_destinatario_id_usuarios_id_fk" FOREIGN KEY ("destinatario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_entrada" ADD CONSTRAINT "pedidos_entrada_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propostas_ia" ADD CONSTRAINT "propostas_ia_pedido_id_pedidos_entrada_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_entrada"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propostas_ia" ADD CONSTRAINT "propostas_ia_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propostas_ia" ADD CONSTRAINT "propostas_ia_revisada_por_id_usuarios_id_fk" FOREIGN KEY ("revisada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefa_envolvidos" ADD CONSTRAINT "tarefa_envolvidos_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefa_envolvidos" ADD CONSTRAINT "tarefa_envolvidos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_frente_id_frentes_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_responsavel_id_usuarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_criador_id_usuarios_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_pedido_id_pedidos_entrada_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_entrada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_frentes" ADD CONSTRAINT "usuario_frentes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_frentes" ADD CONSTRAINT "usuario_frentes_frente_id_frentes_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comentarios_por_tarefa" ON "comentarios" USING btree ("tarefa_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "convites_token_unico" ON "convites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "eventos_acesso_por_alvo" ON "eventos_acesso" USING btree ("alvo_id","criado_em");--> statement-breakpoint
CREATE INDEX "eventos_por_tarefa" ON "eventos_tarefa" USING btree ("tarefa_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_chave_unica" ON "mensagens" USING btree ("chave");--> statement-breakpoint
CREATE INDEX "mensagens_fila" ON "mensagens" USING btree ("status","agendada_para");--> statement-breakpoint
CREATE INDEX "mensagens_por_destinatario" ON "mensagens" USING btree ("destinatario_id","criado_em");--> statement-breakpoint
CREATE INDEX "pedidos_por_autor" ON "pedidos_entrada" USING btree ("autor_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "propostas_ordem_unica" ON "propostas_ia" USING btree ("pedido_id","ordem");--> statement-breakpoint
CREATE INDEX "sessoes_por_usuario" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "tarefas_por_responsavel" ON "tarefas" USING btree ("responsavel_id","estado","prazo");--> statement-breakpoint
CREATE INDEX "tarefas_por_frente" ON "tarefas" USING btree ("frente_id","estado","prazo");--> statement-breakpoint
CREATE INDEX "tarefas_por_criador" ON "tarefas" USING btree ("criador_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_unico" ON "usuarios" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_um_dono" ON "usuarios" USING btree ("dono") WHERE "usuarios"."dono";