CREATE TABLE "modelos_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"itens" text[] NOT NULL,
	"frente_id" uuid,
	"criado_por_id" uuid NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modelos_checklist" ADD CONSTRAINT "modelos_checklist_frente_id_frentes_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos_checklist" ADD CONSTRAINT "modelos_checklist_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "modelos_nome_unico" ON "modelos_checklist" USING btree (lower("nome")) WHERE "modelos_checklist"."ativo";