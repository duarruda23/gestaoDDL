-- Reversão de E1. Executar apenas após conferir que não há séries/ocorrências a preservar.
BEGIN;
DROP TRIGGER IF EXISTS eventos_serie_imutavel ON eventos_serie;
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS ocorrencia_completa;
DROP INDEX IF EXISTS tarefas_ocorrencia_unica;
ALTER TABLE tarefas DROP CONSTRAINT IF EXISTS tarefas_serie_recorrente_id_series_recorrentes_id_fk;
ALTER TABLE tarefas DROP COLUMN IF EXISTS origem_ocorrencia;
ALTER TABLE tarefas DROP COLUMN IF EXISTS gerada_em;
ALTER TABLE tarefas DROP COLUMN IF EXISTS data_programada_local;
ALTER TABLE tarefas DROP COLUMN IF EXISTS chave_ocorrencia;
ALTER TABLE tarefas DROP COLUMN IF EXISTS serie_recorrente_id;
DROP TABLE IF EXISTS eventos_serie;
DROP TABLE IF EXISTS series_recorrentes;
DROP TYPE IF EXISTS origem_ocorrencia;
DROP TYPE IF EXISTS frequencia_recorrencia;
DROP TYPE IF EXISTS estado_serie;
COMMIT;
