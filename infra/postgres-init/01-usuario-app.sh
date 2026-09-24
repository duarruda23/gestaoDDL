#!/bin/sh
# Roda só na primeira inicialização do volume do Postgres.
# Cria o usuário da aplicação SEM privilégio de superusuário: ele lê e grava
# dados, mas não cria tabelas nem altera o schema (isso é das migrações,
# rodadas com o usuário admin).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE ${PG_APP_USER:-gestao_app} LOGIN PASSWORD '${PG_APP_PASSWORD:?defina PG_APP_PASSWORD}';
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${PG_APP_USER:-gestao_app};
GRANT USAGE ON SCHEMA public TO ${PG_APP_USER:-gestao_app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${PG_APP_USER:-gestao_app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${PG_APP_USER:-gestao_app};
SQL
