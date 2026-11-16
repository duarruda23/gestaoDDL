CREATE TABLE "campanha_funil" (
	"meta_campaign_id" text PRIMARY KEY NOT NULL,
	"funil_id" uuid,
	"fora_do_escopo" boolean DEFAULT false NOT NULL,
	"nome_na_epoca" text NOT NULL,
	"definido_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campanha_funil_destino" CHECK (("campanha_funil"."funil_id" is not null) <> "campanha_funil"."fora_do_escopo")
);
--> statement-breakpoint
CREATE TABLE "funis_campanha" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" text NOT NULL,
	"rotulo" text NOT NULL,
	"papel" text DEFAULT 'entrada' NOT NULL,
	"ordem" integer DEFAULT 100 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funis_campanha_papel" CHECK ("funis_campanha"."papel" in ('entrada','etapa','backend','complemento')),
	CONSTRAINT "funis_campanha_rotulo" CHECK (length(btrim("funis_campanha"."rotulo")) between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "campanha_funil" ADD CONSTRAINT "campanha_funil_funil_id_funis_campanha_id_fk" FOREIGN KEY ("funil_id") REFERENCES "public"."funis_campanha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanha_funil" ADD CONSTRAINT "campanha_funil_definido_por_usuarios_id_fk" FOREIGN KEY ("definido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campanha_funil_por_funil" ON "campanha_funil" USING btree ("funil_id");--> statement-breakpoint
CREATE UNIQUE INDEX "funis_campanha_chave_unica" ON "funis_campanha" USING btree ("chave");--> statement-breakpoint
-- Funis iniciais (os 6 do planejamento + Grupo VIP, Mentoria e Análise de Perfil). Idempotente.
INSERT INTO "funis_campanha" ("chave", "rotulo", "papel", "ordem") VALUES
	('desafio', 'Desafio Venda Todo Dia', 'entrada', 1),
	('precificacao', 'Workshop de Precificação', 'entrada', 2),
	('presencial', 'Eventos presenciais', 'entrada', 3),
	('imersao', 'Imersão de Escala', 'entrada', 4),
	('form_antes', 'Formulário antes da venda', 'entrada', 5),
	('live', 'Live Direto ao Ponto', 'entrada', 6),
	('grupo_vip', 'Grupo VIP', 'etapa', 7),
	('mentoria', 'Mentoria', 'backend', 8),
	('analise_perfil', 'Análise de Perfil', 'complemento', 9)
ON CONFLICT ("chave") DO NOTHING;
