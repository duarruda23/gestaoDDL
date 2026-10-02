-- Reverte apenas a coluna do E2; o estado de retomada será perdido.
ALTER TABLE "series_recorrentes" DROP COLUMN IF EXISTS "gerar_desde";
