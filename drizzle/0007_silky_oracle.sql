CREATE TYPE "public"."estado_serie" AS ENUM('ativa', 'pausada', 'encerrada');--> statement-breakpoint
CREATE TYPE "public"."frequencia_recorrencia" AS ENUM('diaria', 'semanal', 'mensal', 'anual', 'personalizada');--> statement-breakpoint
CREATE TYPE "public"."origem_ocorrencia" AS ENUM('automatica', 'criada_na_serie');--> statement-breakpoint
CREATE TABLE "eventos_serie" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"serie_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"ator_id" uuid NOT NULL,
	"antes" jsonb,
	"depois" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_recorrentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"frente_id" uuid NOT NULL,
	"prioridade" "prioridade" DEFAULT 'media' NOT NULL,
	"frequencia" "frequencia_recorrencia" NOT NULL,
	"intervalo" integer DEFAULT 1 NOT NULL,
	"dias_semana" integer[],
	"dia_mes" smallint,
	"ultimo_dia_mes" boolean DEFAULT false NOT NULL,
	"mes_ano" smallint,
	"dia_ano" smallint,
	"inicio_em" date NOT NULL,
	"fim_em" date,
	"hora_vencimento" text,
	"timezone" text DEFAULT 'America/Recife' NOT NULL,
	"responsavel_id" uuid NOT NULL,
	"criado_por_id" uuid NOT NULL,
	"estado" "estado_serie" DEFAULT 'ativa' NOT NULL,
	"requer_atencao" boolean DEFAULT false NOT NULL,
	"pausada_em" timestamp with time zone,
	"pausada_por_id" uuid,
	"motivo_pausa" text,
	"encerrada_em" timestamp with time zone,
	"encerrada_por_id" uuid,
	"motivo_encerramento" text,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serie_intervalo_positivo" CHECK ("series_recorrentes"."intervalo" > 0),
	CONSTRAINT "serie_fim_valido" CHECK ("series_recorrentes"."fim_em" IS NULL OR "series_recorrentes"."fim_em" >= "series_recorrentes"."inicio_em"),
	CONSTRAINT "serie_fuso_recife" CHECK ("series_recorrentes"."timezone" = 'America/Recife'),
	CONSTRAINT "serie_hora_valida" CHECK ("series_recorrentes"."hora_vencimento" IS NULL OR "series_recorrentes"."hora_vencimento" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "serie_dias_validos" CHECK ("series_recorrentes"."dias_semana" IS NULL OR ("series_recorrentes"."dias_semana" <@ ARRAY[1,2,3,4,5,6,7]::integer[] AND cardinality("series_recorrentes"."dias_semana") BETWEEN 1 AND 7)),
	CONSTRAINT "serie_regra_valida" CHECK (COALESCE((
      ("series_recorrentes"."frequencia" = 'diaria' AND "series_recorrentes"."dias_semana" IS NULL AND "series_recorrentes"."dia_mes" IS NULL AND "series_recorrentes"."mes_ano" IS NULL AND "series_recorrentes"."dia_ano" IS NULL AND NOT "series_recorrentes"."ultimo_dia_mes")
      OR ("series_recorrentes"."frequencia" IN ('semanal','personalizada') AND cardinality("series_recorrentes"."dias_semana") >= 1 AND "series_recorrentes"."dia_mes" IS NULL AND "series_recorrentes"."mes_ano" IS NULL AND "series_recorrentes"."dia_ano" IS NULL AND NOT "series_recorrentes"."ultimo_dia_mes")
      OR ("series_recorrentes"."frequencia" = 'mensal' AND "series_recorrentes"."dias_semana" IS NULL AND (("series_recorrentes"."dia_mes" BETWEEN 1 AND 31 AND NOT "series_recorrentes"."ultimo_dia_mes") OR ("series_recorrentes"."dia_mes" IS NULL AND "series_recorrentes"."ultimo_dia_mes")) AND "series_recorrentes"."mes_ano" IS NULL AND "series_recorrentes"."dia_ano" IS NULL)
      OR ("series_recorrentes"."frequencia" = 'anual' AND "series_recorrentes"."dias_semana" IS NULL AND "series_recorrentes"."dia_mes" IS NULL AND NOT "series_recorrentes"."ultimo_dia_mes" AND "series_recorrentes"."mes_ano" BETWEEN 1 AND 12 AND "series_recorrentes"."dia_ano" BETWEEN 1 AND 31)
    ), false))
);
--> statement-breakpoint
ALTER TABLE "tarefas" ADD COLUMN "serie_recorrente_id" uuid;--> statement-breakpoint
ALTER TABLE "tarefas" ADD COLUMN "chave_ocorrencia" text;--> statement-breakpoint
ALTER TABLE "tarefas" ADD COLUMN "data_programada_local" date;--> statement-breakpoint
ALTER TABLE "tarefas" ADD COLUMN "gerada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tarefas" ADD COLUMN "origem_ocorrencia" "origem_ocorrencia";--> statement-breakpoint
ALTER TABLE "eventos_serie" ADD CONSTRAINT "eventos_serie_serie_id_series_recorrentes_id_fk" FOREIGN KEY ("serie_id") REFERENCES "public"."series_recorrentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_serie" ADD CONSTRAINT "eventos_serie_ator_id_usuarios_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_recorrentes" ADD CONSTRAINT "series_recorrentes_frente_id_frentes_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_recorrentes" ADD CONSTRAINT "series_recorrentes_responsavel_id_usuarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_recorrentes" ADD CONSTRAINT "series_recorrentes_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_recorrentes" ADD CONSTRAINT "series_recorrentes_pausada_por_id_usuarios_id_fk" FOREIGN KEY ("pausada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_recorrentes" ADD CONSTRAINT "series_recorrentes_encerrada_por_id_usuarios_id_fk" FOREIGN KEY ("encerrada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_por_serie" ON "eventos_serie" USING btree ("serie_id","criado_em");--> statement-breakpoint
CREATE INDEX "series_por_estado" ON "series_recorrentes" USING btree ("estado");--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_serie_recorrente_id_series_recorrentes_id_fk" FOREIGN KEY ("serie_recorrente_id") REFERENCES "public"."series_recorrentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tarefas_ocorrencia_unica" ON "tarefas" USING btree ("serie_recorrente_id","chave_ocorrencia");--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "ocorrencia_completa" CHECK (("tarefas"."serie_recorrente_id" IS NULL AND "tarefas"."chave_ocorrencia" IS NULL AND "tarefas"."data_programada_local" IS NULL AND "tarefas"."gerada_em" IS NULL AND "tarefas"."origem_ocorrencia" IS NULL) OR ("tarefas"."serie_recorrente_id" IS NOT NULL AND "tarefas"."chave_ocorrencia" IS NOT NULL AND "tarefas"."data_programada_local" IS NOT NULL AND "tarefas"."gerada_em" IS NOT NULL AND "tarefas"."origem_ocorrencia" IS NOT NULL));
--> statement-breakpoint
CREATE TRIGGER eventos_serie_imutavel BEFORE UPDATE OR DELETE ON eventos_serie
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_historico();
