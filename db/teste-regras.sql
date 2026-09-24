-- Teste das regras do banco. Roda na CI depois das migrações, num banco
-- descartável: psql -v ON_ERROR_STOP=1 -f db/teste-regras.sql
-- Cada bloco espera que o banco RECUSE algo; se aceitar, o teste falha.

BEGIN;

INSERT INTO usuarios (id, nome, email, telefone_whatsapp, dono, gerencia_acessos)
VALUES ('00000000-0000-0000-0000-000000000001', 'Ítalo', 'italo@exemplo.com', '+55 82 90000-0001', true, true);
INSERT INTO usuarios (id, nome, email, telefone_whatsapp)
VALUES ('00000000-0000-0000-0000-000000000002', 'Eduardo', 'eduardo@exemplo.com', '+55 81 90000-0002');
INSERT INTO frentes (id, nome) VALUES ('00000000-0000-0000-0000-0000000000f1', 'Campanhas e tráfego');

-- 1. Só pode existir um dono.
DO $$ BEGIN
  INSERT INTO usuarios (nome, email, telefone_whatsapp, dono, gerencia_acessos) VALUES ('Outro', 'outro@exemplo.com', '+55 11 1', true, true);
  RAISE EXCEPTION 'FALHOU: aceitou um segundo dono';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok: um dono só';
END $$;

-- 2. O dono não pode ficar sem acesso.
DO $$ BEGIN
  UPDATE usuarios SET ativo = false, acesso_removido_em = now() WHERE id = '00000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'FALHOU: removeu o acesso do dono';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: dono sempre ativo';
END $$;

-- 3. A aplicação não tira o posto de dono.
DO $$ BEGIN
  UPDATE usuarios SET dono = false WHERE id = '00000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'FALHOU: tirou o posto de dono';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: dono protegido';
END $$;

-- 4. E-mail único sem diferenciar maiúsculas.
DO $$ BEGIN
  INSERT INTO usuarios (nome, email, telefone_whatsapp) VALUES ('Duplicado', 'EDUARDO@exemplo.com', '+55 11 2');
  RAISE EXCEPTION 'FALHOU: aceitou e-mail repetido';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok: e-mail único';
END $$;

-- 5. Tarefa só sai da triagem com dono, prazo e frente.
DO $$ BEGIN
  INSERT INTO tarefas (titulo, criador_id, estado) VALUES ('Sem dono', '00000000-0000-0000-0000-000000000002', 'a_fazer');
  RAISE EXCEPTION 'FALHOU: liberou tarefa incompleta';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: triagem exige dono, prazo e frente';
END $$;

-- 6. Bloqueio exige motivo.
DO $$ BEGIN
  INSERT INTO tarefas (titulo, criador_id, responsavel_id, frente_id, prazo, estado)
  VALUES ('Bloqueada sem motivo', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', current_date, 'bloqueada');
  RAISE EXCEPTION 'FALHOU: bloqueou sem motivo';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: bloqueio tem motivo';
END $$;

-- Tarefa válida para os próximos testes.
INSERT INTO tarefas (id, titulo, criador_id, responsavel_id, frente_id, prazo, estado)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'Subir criativos', '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', current_date + 1, 'a_fazer');
INSERT INTO eventos_tarefa (tarefa_id, tipo, ator_id, depois)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'criada', '00000000-0000-0000-0000-000000000001', 'Pedida manualmente');

-- 7. Histórico não pode ser editado nem apagado.
DO $$ BEGIN
  UPDATE eventos_tarefa SET depois = 'adulterado';
  RAISE EXCEPTION 'FALHOU: editou o histórico';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: histórico imutável (update)';
END $$;
DO $$ BEGIN
  DELETE FROM eventos_tarefa;
  RAISE EXCEPTION 'FALHOU: apagou o histórico';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: histórico imutável (delete)';
END $$;

-- 8. Mesma chave de mensagem não entra duas vezes (idempotência do n8n).
INSERT INTO mensagens (chave, tarefa_id, regra, destinatario_id, texto)
VALUES ('a1|vencida|2026-09-24|u2', '00000000-0000-0000-0000-0000000000a1', 'vencida', '00000000-0000-0000-0000-000000000002', 'teste');
DO $$ BEGIN
  INSERT INTO mensagens (chave, tarefa_id, regra, destinatario_id, texto)
  VALUES ('a1|vencida|2026-09-24|u2', '00000000-0000-0000-0000-0000000000a1', 'vencida', '00000000-0000-0000-0000-000000000002', 'teste');
  RAISE EXCEPTION 'FALHOU: duplicou mensagem';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok: mensagem idempotente';
END $$;

-- 9. Remover acesso encerra as sessões da pessoa.
INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ('hash-teste', '00000000-0000-0000-0000-000000000002', now() + interval '7 days');
UPDATE usuarios SET ativo = false, acesso_removido_em = now(), acesso_removido_por_id = '00000000-0000-0000-0000-000000000001'
WHERE id = '00000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM sessoes WHERE usuario_id = '00000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FALHOU: sessão continuou depois de remover o acesso';
  END IF;
  RAISE NOTICE 'ok: remover acesso encerra sessões';
END $$;

-- 10. A configuração padrão de cobranças existe.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM config_cobranca WHERE id = 1 AND janela_inicio = 8 AND janela_fim = 19) THEN
    RAISE EXCEPTION 'FALHOU: configuração padrão de cobranças ausente';
  END IF;
  RAISE NOTICE 'ok: configuração padrão';
END $$;

ROLLBACK;
