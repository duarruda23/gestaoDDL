-- Proteções que o schema do Drizzle não expressa. Escrita à mão.

-- 1. Histórico imutável (spec, seção 8): eventos só recebem INSERT.
CREATE OR REPLACE FUNCTION bloquear_alteracao_historico() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'O histórico (%) não pode ser alterado nem apagado', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER eventos_tarefa_imutavel
  BEFORE UPDATE OR DELETE ON eventos_tarefa
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_historico();
--> statement-breakpoint
CREATE TRIGGER eventos_acesso_imutavel
  BEFORE UPDATE OR DELETE ON eventos_acesso
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_historico();
--> statement-breakpoint

-- 2. Remover o acesso de alguém encerra todas as sessões da pessoa na hora,
--    mesmo que a aplicação esqueça de fazer isso.
CREATE OR REPLACE FUNCTION encerrar_sessoes_ao_remover_acesso() RETURNS trigger AS $$
BEGIN
  IF OLD.ativo AND NOT NEW.ativo THEN
    DELETE FROM sessoes WHERE usuario_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER usuarios_encerrar_sessoes
  AFTER UPDATE OF ativo ON usuarios
  FOR EACH ROW EXECUTE FUNCTION encerrar_sessoes_ao_remover_acesso();
--> statement-breakpoint

-- 3. O dono (Ítalo) não perde o posto por engano: só troca de dono com a
--    variável de sessão app.permitir_troca_de_dono = 'sim', num script de operação.
CREATE OR REPLACE FUNCTION proteger_dono() RETURNS trigger AS $$
BEGIN
  IF OLD.dono AND NOT NEW.dono AND coalesce(current_setting('app.permitir_troca_de_dono', true), '') <> 'sim' THEN
    RAISE EXCEPTION 'O dono do sistema não pode ser alterado pela aplicação'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER usuarios_proteger_dono
  BEFORE UPDATE OF dono ON usuarios
  FOR EACH ROW EXECUTE FUNCTION proteger_dono();
--> statement-breakpoint

-- 4. Configuração padrão das cobranças (linha única).
INSERT INTO config_cobranca (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
