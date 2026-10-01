ALTER TABLE "series_recorrentes" ADD COLUMN "gerar_desde" date;--> statement-breakpoint
UPDATE "series_recorrentes" SET "gerar_desde" = "inicio_em";--> statement-breakpoint
ALTER TABLE "series_recorrentes" ALTER COLUMN "gerar_desde" SET NOT NULL;
